//! Override 规则主键的确定性哈希（SHA-256）。规范见仓库根目录 `docs/override-id.md`。
use crate::state::OverrideRule;
use sha2::Digest;
use sha2::Sha256;

/// Same as traffic path normalization: empty -> `/`, ensure leading `/`.
fn normalize_path_for_id(p: &str) -> String {
    let t = p.trim();
    if t.is_empty() {
        return "/".to_string();
    }
    if t.starts_with('/') {
        t.to_string()
    } else {
        format!("/{t}")
    }
}

/// Sorted concatenation: for each (k, v) sorted by (k ascii_lowercase, v), append
/// `k.to_lowercase() + v` in order.
pub fn sorted_kv_blob(pairs: &[(String, String)]) -> String {
    let mut v: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    v.sort_by(|(ka, va), (kb, vb)| {
        let la = ka.to_ascii_lowercase();
        let lb = kb.to_ascii_lowercase();
        la.cmp(&lb).then_with(|| (*va).cmp(*vb))
    });
    let mut s = String::new();
    for (k, val) in v {
        s.push_str(&k.to_ascii_lowercase());
        s.push_str(val);
    }
    s
}

/// Canonical string hashed into an override id (see product spec: protocol, host, path,
/// sorted header and query key/value, body).
pub fn identity_material(rule: &OverrideRule) -> String {
    let p = rule.match_protocol.as_deref().unwrap_or("");
    let h = rule.match_host.as_deref().unwrap_or("");
    let path = match &rule.match_path {
        None => String::new(),
        Some(s) if s.trim().is_empty() => String::new(),
        Some(s) => normalize_path_for_id(s),
    };
    let hb = sorted_kv_blob(&rule.match_request_headers);
    let qb = sorted_kv_blob(&rule.match_query);
    let b = rule.match_request_body.as_deref().unwrap_or("");
    format!("{p}{h}{path}{hb}{qb}{b}")
}

pub fn override_id_from_material(material: &str) -> String {
    let mut h = Sha256::new();
    h.update(material.as_bytes());
    let out = h.finalize();
    format!("{out:x}")
}

pub fn override_id_for_rule(rule: &OverrideRule) -> String {
    override_id_from_material(&identity_material(rule))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_stable() {
        let r = OverrideRule {
            id: "x".to_string(),
            enabled: true,
            match_protocol: Some("https".to_string()),
            match_host: Some("example.com".to_string()),
            match_path: Some("/a".to_string()),
            match_request_headers: vec![("X-Api".to_string(), "1".to_string())],
            match_query: vec![("B".to_string(), "2".to_string())],
            match_request_body: None,
            status: 200,
            headers: vec![],
            body: String::new(),
            stream_interval_ms: None,
        };
        let id1 = override_id_for_rule(&r);
        let id2 = override_id_for_rule(&r);
        assert_eq!(id1, id2);
        assert_eq!(id1.len(), 64);
    }
}
