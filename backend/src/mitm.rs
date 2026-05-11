//! TLS interception for HTTPS: dynamic leaf certs signed by a local **RSA-2048** CA
//! (`PKCS_RSA_SHA256` / PKCS#8 keys via rcgen). Persisted under `MITM_CA_DIR` (default `mitm-ca-rsa/`).
//! Users must install the CA PEM (see `/api/mitm/ca.pem`) to avoid browser errors.
//!
//! 与浏览器/客户端之间的 TLS 终止使用 `rustls`：服务端可以显式声明 ALPN
//! `h2 + http/1.1`，避免 HTTP/2-only 客户端在 ClientHello 阶段以 `no_application_protocol`
//! 中断。叶子证书有效期收到 397 天以兼容 Apple ATS / Chrome 的 leaf-validity 策略。

use anyhow::Context;
use parking_lot::Mutex;
use rcgen::{
    date_time_ymd, BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType,
    ExtendedKeyUsagePurpose, IsCa, Issuer, KeyPair, KeyUsagePurpose, RsaKeySize, PKCS_RSA_SHA256,
};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::ServerConfig;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use time::{Duration as TimeDuration, OffsetDateTime};

/// 叶子证书 PEM 缓存上限（按签发的不同 host 计数）。RSA-2048 生成 + 签名通常耗时
/// 50–300ms，缓存能让同一 host 的后续 CONNECT 几乎立即完成 TLS 握手。
const LEAF_CACHE_MAX: usize = 4096;

/// 叶子有效期上限：Apple Platform Security 要求公网信任的 leaf ≤ 398 天，
/// Chrome 同步执行；用户手工 trust 的 CA 在多数路径下豁免，但仍有部分自定义网络栈
/// （SwiftNIO、Conscrypt strict 等）按严格策略拒绝。取 397 天稳过。
const LEAF_VALIDITY_DAYS: i64 = 397;

pub struct Mitm {
    ca_cert_pem: String,
    ca_cert_der: CertificateDer<'static>,
    ca_key: KeyPair,
    /// 直接缓存可复用的 `Arc<ServerConfig>`：rustls 的 ServerConfig 自身就是 `Send + Sync`，
    /// 多个并发 TLS accept 共享同一份配置即可，握手过程中只读不写。
    leaf_cache: Mutex<HashMap<String, Arc<ServerConfig>>>,
}

impl Mitm {
    /// Load existing CA from `dir/ca.pem` + `dir/ca-key.pem`, or create and persist them.
    pub fn load_or_create(dir: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(dir).with_context(|| format!("create {:?}", dir))?;
        let ca_cert_path = dir.join("ca.pem");
        let ca_key_path = dir.join("ca-key.pem");

        let (ca_cert_pem, ca_key) = if ca_cert_path.is_file() && ca_key_path.is_file() {
            let ca_cert_pem = std::fs::read_to_string(&ca_cert_path)
                .with_context(|| format!("read {:?}", ca_cert_path))?;
            let key_pem = std::fs::read_to_string(&ca_key_path)
                .with_context(|| format!("read {:?}", ca_key_path))?;
            let ca_key = KeyPair::from_pem(&key_pem).context("parse CA key PEM")?;
            (ca_cert_pem, ca_key)
        } else {
            let ca_name = format!(
                "Proxy App MITM CA ({})",
                chrono::Local::now().format("%Y-%m-%d")
            );
            let mut params = CertificateParams::new(Vec::<String>::new()).context("CA cert params")?;
            params.distinguished_name = DistinguishedName::new();
            params.distinguished_name.push(DnType::CountryName, "US");
            params
                .distinguished_name
                .push(DnType::OrganizationName, "Proxy App Local");
            params.distinguished_name.push(DnType::CommonName, ca_name);
            params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
            params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
            params.extended_key_usages = vec![
                ExtendedKeyUsagePurpose::ServerAuth,
                ExtendedKeyUsagePurpose::ClientAuth,
            ];
            params.not_before = date_time_ymd(2026, 1, 1);
            params.not_after = date_time_ymd(2036, 12, 31);
            let ca_key = KeyPair::generate_rsa_for(&PKCS_RSA_SHA256, RsaKeySize::_2048)
                .context("generate RSA CA key")?;
            let ca_cert: Certificate = params.self_signed(&ca_key).context("self-sign CA")?;
            let ca_cert_pem = ca_cert.pem();
            std::fs::write(&ca_cert_path, &ca_cert_pem).with_context(|| format!("write {:?}", ca_cert_path))?;
            std::fs::write(&ca_key_path, ca_key.serialize_pem())
                .with_context(|| format!("write {:?}", ca_key_path))?;
            (ca_cert_pem, ca_key)
        };

        let ca_cert_der = parse_single_cert_from_pem(&ca_cert_pem).context("decode CA PEM to DER")?;

        Ok(Self {
            ca_cert_pem,
            ca_cert_der,
            ca_key,
            leaf_cache: Mutex::new(HashMap::new()),
        })
    }

    pub fn ca_pem(&self) -> &str {
        &self.ca_cert_pem
    }

    /// 为 `host` 签发叶子证书并组装为 `rustls::ServerConfig`，ALPN 通告 `h2` 和 `http/1.1`，
    /// 让接收侧能与 HTTP/2-only 客户端正常协商。
    ///
    /// 命中缓存时直接返回 `Arc<ServerConfig>`，跳过 RSA-2048 生成 + 签名（热路径里最耗时的一步）。
    /// 两个并发请求可能同时未命中并各自构造一份配置，仅造成一次性多余开销，不影响正确性，
    /// 故这里不再加 per-host 互斥。
    pub fn rustls_server_config(&self, host: &str) -> anyhow::Result<Arc<ServerConfig>> {
        let key = host.to_ascii_lowercase();
        if let Some(cfg) = self.leaf_cache.lock().get(&key).cloned() {
            return Ok(cfg);
        }

        let issuer = Issuer::from_ca_cert_pem(&self.ca_cert_pem, &self.ca_key)
            .context("issuer from CA")?;

        let mut params = CertificateParams::new(vec![host.to_string()]).context("leaf params")?;
        params.distinguished_name = DistinguishedName::new();
        params.distinguished_name.push(DnType::CommonName, host);
        params.key_usages = vec![
            KeyUsagePurpose::DigitalSignature,
            KeyUsagePurpose::KeyEncipherment,
        ];
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        // 397 天内有效；并对 not_before 做 1 小时 backdate，容忍轻微的客户端时钟偏移。
        let now = OffsetDateTime::now_utc();
        params.not_before = now - TimeDuration::hours(1);
        params.not_after = now + TimeDuration::days(LEAF_VALIDITY_DAYS);

        let leaf_key = KeyPair::generate_rsa_for(&PKCS_RSA_SHA256, RsaKeySize::_2048)
            .context("generate RSA leaf key")?;
        let leaf_cert: Certificate = params
            .signed_by(&leaf_key, &issuer)
            .context("sign leaf")?;

        let leaf_der = leaf_cert.der().clone();
        let cert_chain: Vec<CertificateDer<'static>> = vec![leaf_der, self.ca_cert_der.clone()];
        let key_der = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(leaf_key.serialize_der()));

        let mut server_cfg = ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(cert_chain, key_der)
            .map_err(|e| anyhow::anyhow!("rustls with_single_cert: {e}"))?;
        server_cfg.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        let arc = Arc::new(server_cfg);

        let mut cache = self.leaf_cache.lock();
        // 上限保护：超过阈值直接清空再插入，避免被恶意/枚举式 host 撑爆内存。
        if cache.len() >= LEAF_CACHE_MAX {
            cache.clear();
        }
        cache.insert(key, arc.clone());

        Ok(arc)
    }
}

/// 把 PEM 字符串里第一段 `-----BEGIN CERTIFICATE-----` 解码成 DER。
/// 仅在 CA 加载时调用一次。
fn parse_single_cert_from_pem(pem_str: &str) -> anyhow::Result<CertificateDer<'static>> {
    let parsed = pem::parse(pem_str.as_bytes()).context("parse CA PEM")?;
    if parsed.tag() != "CERTIFICATE" {
        anyhow::bail!("CA PEM has unexpected tag: {}", parsed.tag());
    }
    Ok(CertificateDer::from(parsed.into_contents()))
}
