use super::*;
use hyper::header::{HeaderMap, HeaderValue, COOKIE, HOST};

#[test]
fn parse_url_for_override_includes_explicit_port_in_host() {
    let (_, host, _, path_only, _) = parse_url_for_override("http://localhost:3000/api/v1");
    assert_eq!(host, "localhost:3000");
    assert_eq!(path_only, "/api/v1");

    let (_, host_default, _, _, _) = parse_url_for_override("http://example.com/api");
    assert_eq!(host_default, "example.com");
}

#[test]
fn host_with_optional_port_formats_authority_like_override_match_host() {
    assert_eq!(
        host_with_optional_port("localhost", Some(3000)),
        "localhost:3000"
    );
    assert_eq!(host_with_optional_port("example.com", None), "example.com");
}

#[test]
fn reqwest_headers_for_upstream_preserves_duplicate_request_headers() {
    let mut headers = HeaderMap::new();
    headers.append(COOKIE, HeaderValue::from_static("session=abc"));
    headers.append(COOKIE, HeaderValue::from_static("prefs=dark"));

    let upstream_headers = reqwest_headers_for_upstream(&headers);
    let cookies = upstream_headers
        .get_all(reqwest::header::COOKIE)
        .iter()
        .map(|value| value.to_str().unwrap())
        .collect::<Vec<_>>();

    assert_eq!(cookies, vec!["session=abc", "prefs=dark"]);
}

#[test]
fn reqwest_headers_for_upstream_skips_proxy_specific_headers() {
    let mut headers = HeaderMap::new();
    headers.insert(HOST, HeaderValue::from_static("example.com"));
    headers.insert("proxy-connection", HeaderValue::from_static("keep-alive"));
    headers.insert("x-request-id", HeaderValue::from_static("request-1"));

    let upstream_headers = reqwest_headers_for_upstream(&headers);

    assert!(upstream_headers.get(reqwest::header::HOST).is_none());
    assert!(upstream_headers.get("proxy-connection").is_none());
    assert_eq!(
        upstream_headers
            .get("x-request-id")
            .and_then(|value| value.to_str().ok()),
        Some("request-1")
    );
}

#[test]
fn classify_mitm_accept_error_distinguishes_known_categories() {
    let cert_rejection = classify_mitm_accept_error(&"received fatal alert: unknown ca");
    assert_eq!(cert_rejection, MitmAcceptFailureKind::ClientCertRejection);

    let handshake_eof = classify_mitm_accept_error(&"tls handshake eof");
    assert_eq!(handshake_eof, MitmAcceptFailureKind::HandshakeEof);

    let other = classify_mitm_accept_error(&"peer uses unsupported protocol version");
    assert_eq!(other, MitmAcceptFailureKind::Other);
}

#[test]
fn looks_like_tls_clienthello_matches_tls_record_prefix() {
    assert!(looks_like_tls_clienthello(&[0x16, 0x03, 0x03, 0x00, 0x2a]));
    assert!(looks_like_tls_clienthello(&[0x16, 0x03, 0x04]));
    assert!(!looks_like_tls_clienthello(&[0x17, 0x03, 0x03]));
    assert!(!looks_like_tls_clienthello(&[0x16, 0x04, 0x01]));
    assert!(!looks_like_tls_clienthello(&[0x16, 0x03]));
}

#[test]
fn parse_lsof_client_app_name_prefers_client_side_connection() {
    let peer = "127.0.0.1:62001".parse().unwrap();
    let stdout = "\
p100
cproxy-app
n127.0.0.1:9090->127.0.0.1:62001
p200
cGoogle Chrome
n127.0.0.1:62001->127.0.0.1:9090
";

    let app_name = parse_lsof_client_app_name(stdout, peer, 100);

    assert_eq!(app_name.as_deref(), Some("Google Chrome"));
}

#[test]
fn parse_lsof_client_app_name_excludes_proxy_process_fallback() {
    let peer = "127.0.0.1:62002".parse().unwrap();
    let stdout = "\
p100
cproxy-app
n127.0.0.1:9090->127.0.0.1:62002
p300
ccurl
n127.0.0.1:9090->127.0.0.1:62002
";

    let app_name = parse_lsof_client_app_name(stdout, peer, 100);

    assert_eq!(app_name.as_deref(), Some("curl"));
}

#[test]
fn split_rule_body_by_empty_lines_keeps_empty_middle_chunks() {
    let chunks = split_rule_body_by_empty_lines("a\n\n\n\nb");
    assert_eq!(
        chunks,
        vec!["a".to_string(), "".to_string(), "b".to_string()]
    );
}

#[test]
fn filtered_rule_headers_respects_streaming_and_encoding_flags() {
    let headers = vec![
        ("content-length".to_string(), "100".to_string()),
        ("content-encoding".to_string(), "gzip".to_string()),
        ("connection".to_string(), "keep-alive".to_string()),
        ("x-custom".to_string(), "ok".to_string()),
    ];

    let streamed = filtered_rule_headers(&headers, true, false);
    assert!(streamed
        .iter()
        .all(|(k, _)| !k.eq_ignore_ascii_case("content-length")));
    assert!(streamed
        .iter()
        .all(|(k, _)| !k.eq_ignore_ascii_case("content-encoding")));
    assert!(streamed
        .iter()
        .all(|(k, _)| !k.eq_ignore_ascii_case("connection")));
    assert!(streamed.iter().any(|(k, _)| k == "x-custom"));

    let non_streamed_keep_encoding = filtered_rule_headers(&headers, false, true);
    assert!(non_streamed_keep_encoding
        .iter()
        .any(|(k, _)| k.eq_ignore_ascii_case("content-encoding")));
    assert!(non_streamed_keep_encoding
        .iter()
        .all(|(k, _)| !k.eq_ignore_ascii_case("content-length")));
}
