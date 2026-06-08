use super::*;
use chrono::Utc;
use http::header::HeaderMap;
use reqwest::Client;
use uuid::Uuid;

fn rule_with(host: &str, path: &str) -> OverrideRule {
    OverrideRule {
        id: "r".to_string(),
        enabled: true,
        match_method: None,
        match_protocol: Some("https".to_string()),
        match_host: Some(host.to_string()),
        match_path: Some(path.to_string()),
        match_request_headers: Vec::new(),
        match_query: Vec::new(),
        match_request_body: None,
        status: 200,
        headers: Vec::new(),
        body: String::new(),
        map_remote_protocol: Some("http".to_string()),
        map_remote_host: Some("localhost:3000".to_string()),
        map_remote_path: Some("*".to_string()),
        stream_interval_ms: None,
    }
}

#[test]
fn wildcard_host_matches_subdomain() {
    let rule = rule_with("*.example.com", "/api/*");
    assert!(rule.matches(
        "GET",
        "https",
        "api.example.com",
        "/api/v1/users?x=1",
        "/api/v1/users",
        &[],
        &HeaderMap::new(),
        b"",
    ));
}

#[test]
fn wildcard_path_supports_single_char() {
    let rule = rule_with("example.com", "/v?/users");
    assert!(rule.matches(
        "GET",
        "https",
        "example.com",
        "/v1/users",
        "/v1/users",
        &[],
        &HeaderMap::new(),
        b"",
    ));
    assert!(!rule.matches(
        "GET",
        "https",
        "example.com",
        "/v10/users",
        "/v10/users",
        &[],
        &HeaderMap::new(),
        b"",
    ));
}

#[test]
fn method_match_is_case_insensitive_and_optional() {
    let mut rule = rule_with("example.com", "/api");
    rule.match_method = Some("POST".to_string());
    assert!(rule.matches(
        "post",
        "https",
        "example.com",
        "/api",
        "/api",
        &[],
        &HeaderMap::new(),
        b"",
    ));
    assert!(!rule.matches(
        "GET",
        "https",
        "example.com",
        "/api",
        "/api",
        &[],
        &HeaderMap::new(),
        b"",
    ));
}

fn build_state_for_app_tests() -> AppState {
    AppState::new(
        16,
        None,
        None,
        std::env::temp_dir().join("proxy-app-state-tests.sqlite"),
        Vec::new(),
        Vec::new(),
        Client::new(),
        None,
        false,
    )
}

fn sample_traffic_entry(id: Uuid) -> TrafficEntry {
    TrafficEntry {
        id,
        at: Utc::now(),
        peer: "127.0.0.1:12345".to_string(),
        app_name: None,
        method: "GET".to_string(),
        url: "https://example.com/api".to_string(),
        scheme: "https".to_string(),
        host: "example.com".to_string(),
        path: "/api".to_string(),
        request_headers: Vec::new(),
        request_body_preview: None,
        kind: TrafficKind::Http,
        mitm_bypassed: false,
        response_status: None,
        response_headers: None,
        response_body_preview: None,
        duration_ms: None,
        error: None,
        pending: false,
        breakpoint_name: None,
        override_match_id: None,
        breakpoint_match_id: None,
        stream_controllable: false,
        stream_playing: None,
    }
}

#[test]
fn set_stream_playing_updates_entry_and_reports_missing_controller() {
    let state = build_state_for_app_tests();
    let id = Uuid::new_v4();
    let missing_id = Uuid::new_v4();
    state.push_traffic(sample_traffic_entry(id));
    let _rx = state.register_stream_controller(id, false);

    assert!(state.set_stream_playing(id, true));
    let updated = state
        .traffic
        .read()
        .iter()
        .find(|entry| entry.id == id)
        .cloned()
        .expect("entry exists");
    assert_eq!(updated.stream_playing, Some(true));
    assert!(!state.set_stream_playing(missing_id, true));
}

#[test]
fn auto_bypass_hosts_are_case_insensitive() {
    let state = build_state_for_app_tests();
    assert!(state.mark_auto_bypass_mitm("Example.COM"));
    assert!(state.should_auto_bypass_mitm("example.com"));
    assert!(state.should_auto_bypass_mitm("EXAMPLE.COM"));
    assert!(!state.mark_auto_bypass_mitm("example.com"));
}

#[test]
fn push_traffic_is_ignored_when_capture_paused() {
    let state = build_state_for_app_tests();
    state.set_capture_paused(true);
    state.push_traffic(sample_traffic_entry(Uuid::new_v4()));
    assert!(state.traffic.read().is_empty());
}

#[test]
fn breakpoint_method_match_is_case_insensitive_and_optional() {
    let rule = BreakpointRule {
        id: Uuid::new_v4(),
        name: "bp".to_string(),
        enabled: true,
        match_method: Some("POST".to_string()),
        match_origin: Some("https://example.com".to_string()),
        match_path_regex: Some("^/api".to_string()),
    };
    assert!(rule.matches("post", "https://example.com", "/api/v1"));
    assert!(!rule.matches("GET", "https://example.com", "/api/v1"));
}
