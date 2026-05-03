//! TLS interception for HTTPS: dynamic leaf certs signed by a local **RSA-2048** CA
//! (`PKCS_RSA_SHA256` / PKCS#8 keys via rcgen). Persisted under `MITM_CA_DIR` (default `mitm-ca-rsa/`).
//! Users must install the CA PEM (see `/api/mitm/ca.pem`) to avoid browser errors.
//!
//! 与浏览器之间的 TLS 终止使用 `native-tls`（系统 Security.framework / OpenSSL / SChannel），
//! 避免 rustls 服务端对 ClientHello 强制要求顶层 `signature_algorithms` 扩展
//!（ECH 外层 ClientHello 等场景会缺失该扩展，触发 `SignatureAlgorithmsExtensionRequired`）。

use anyhow::Context;
use native_tls::Identity;
use rcgen::{
    date_time_ymd, BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType,
    ExtendedKeyUsagePurpose, IsCa, Issuer, KeyPair, KeyUsagePurpose, RsaKeySize, PKCS_RSA_SHA256,
};
use std::path::Path;

pub struct Mitm {
    ca_cert_pem: String,
    ca_key: KeyPair,
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
            params.not_after = date_time_ymd(2028, 12, 31);
            let ca_key = KeyPair::generate_rsa_for(&PKCS_RSA_SHA256, RsaKeySize::_2048)
                .context("generate RSA CA key")?;
            let ca_cert: Certificate = params.self_signed(&ca_key).context("self-sign CA")?;
            let ca_cert_pem = ca_cert.pem();
            std::fs::write(&ca_cert_path, &ca_cert_pem).with_context(|| format!("write {:?}", ca_cert_path))?;
            std::fs::write(&ca_key_path, ca_key.serialize_pem())
                .with_context(|| format!("write {:?}", ca_key_path))?;
            (ca_cert_pem, ca_key)
        };

        Ok(Self {
            ca_cert_pem,
            ca_key,
        })
    }

    pub fn ca_pem(&self) -> &str {
        &self.ca_cert_pem
    }

    /// 为 `host` 签发叶子证书并打包为 `native_tls::Identity`（PEM 证书链 + PKCS#8 PEM 私钥）。
    ///
    /// 注意：`native_tls::Identity::from_pkcs8` 在各平台实现里要求私钥为 **PEM**（`BEGIN PRIVATE KEY`），
    /// 不能传 DER；否则会失败（macOS 上常为 `errSecParam`）。
    pub fn native_tls_identity(&self, host: &str) -> anyhow::Result<Identity> {
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
        params.not_before = date_time_ymd(2026, 1, 1);
        params.not_after = date_time_ymd(2028, 12, 31);
        let leaf_key = KeyPair::generate_rsa_for(&PKCS_RSA_SHA256, RsaKeySize::_2048)
            .context("generate RSA leaf key")?;
        let leaf_cert: Certificate = params
            .signed_by(&leaf_key, &issuer)
            .context("sign leaf")?;

        let cert_chain_pem = format!("{}{}", leaf_cert.pem(), self.ca_cert_pem);
        let key_pem = leaf_key.serialize_pem();
        Identity::from_pkcs8(cert_chain_pem.as_bytes(), key_pem.as_bytes()).map_err(|e| {
            anyhow::anyhow!("native_tls Identity::from_pkcs8: {e}")
        })
    }
}
