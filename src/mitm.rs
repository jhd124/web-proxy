//! TLS interception for HTTPS: dynamic leaf certs signed by a local CA.
//! Users must install the CA PEM (see `/api/mitm/ca.pem`) to avoid browser errors.

use anyhow::Context;
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, ExtendedKeyUsagePurpose, IsCa,
    Issuer, KeyPair, KeyUsagePurpose,
};
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::ServerConfig;
use std::path::Path;
use std::sync::Arc;

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
            let mut params = CertificateParams::new(vec!["proxy-app MITM CA".to_string()])
                .context("CA cert params")?;
            params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
            params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
            let ca_key = KeyPair::generate().context("generate CA key")?;
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

    /// Per-connection TLS config: leaf cert for `host`, signed by our CA. Advertises HTTP/1.1 only.
    pub fn server_config(&self, host: &str) -> anyhow::Result<Arc<ServerConfig>> {
        let issuer = Issuer::from_ca_cert_pem(&self.ca_cert_pem, &self.ca_key)
            .context("issuer from CA")?;

        let mut params = CertificateParams::new(vec![host.to_string()]).context("leaf params")?;
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        let leaf_key = KeyPair::generate().context("leaf key")?;
        let leaf_cert: Certificate = params
            .signed_by(&leaf_key, &issuer)
            .context("sign leaf")?;

        let cert_der = CertificateDer::from(leaf_cert.der().to_vec());
        let key_der = PrivateKeyDer::Pkcs8(leaf_key.serialize_der().into());

        let mut config = ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert_der], key_der)
            .context("rustls server config")?;
        config.alpn_protocols = vec![b"http/1.1".to_vec()];
        Ok(Arc::new(config))
    }
}
