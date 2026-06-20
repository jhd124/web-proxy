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
fn requester_app_name_removes_helper_suffixes() {
    let mut entry = sample_traffic_entry(Uuid::new_v4());
    entry.app_name = Some("Google Chrome Helper".to_string());
    assert_eq!(requester_app_name(&entry), "Google Chrome");

    entry.app_name = Some("Cursor Helper (Plugin)".to_string());
    assert_eq!(requester_app_name(&entry), "Cursor");

    entry.app_name = Some("Safari".to_string());
    assert_eq!(requester_app_name(&entry), "Safari");
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
fn clear_traffic_advances_generation_and_releases_stream_previews() {
    let state = build_state_for_app_tests();
    let id = Uuid::new_v4();
    let generation = state.traffic_generation();
    let buffer = Arc::new(Mutex::new(vec![1, 2, 3]));

    state.push_traffic(sample_traffic_entry(id));
    state.register_stream_preview_buffer(id, buffer.clone());
    assert!(state.is_current_traffic_generation(generation));
    assert_eq!(state.stream_preview_buffers.lock().len(), 1);

    state.clear_traffic_releasing_capacity();

    assert!(state.traffic.read().is_empty());
    assert!(!state.is_current_traffic_generation(generation));
    assert!(state.stream_preview_buffers.lock().is_empty());
    assert!(buffer.lock().is_empty());
}

#[test]
fn recompute_fills_and_clears_override_match_id_on_rule_change() {
    let state = build_state_for_app_tests();
    let id = Uuid::new_v4();
    state.push_traffic(sample_traffic_entry(id));
    // 初始无规则，命中 id 为空。
    assert_eq!(
        state
            .traffic
            .read()
            .iter()
            .find(|entry| entry.id == id)
            .and_then(|entry| entry.override_match_id.clone()),
        None,
    );

    // 新增一条能命中历史条目的 override 后重算，命中 id 被填充。
    state
        .overrides
        .write()
        .insert(0, rule_with("example.com", "/api"));
    state.recompute_rule_matches();
    assert_eq!(
        state
            .traffic
            .read()
            .iter()
            .find(|entry| entry.id == id)
            .and_then(|entry| entry.override_match_id.clone()),
        Some("r".to_string()),
    );

    // 删除规则后重算，命中 id 被清空。
    state.overrides.write().clear();
    state.recompute_rule_matches();
    assert_eq!(
        state
            .traffic
            .read()
            .iter()
            .find(|entry| entry.id == id)
            .and_then(|entry| entry.override_match_id.clone()),
        None,
    );
}

#[test]
fn recompute_fills_and_clears_breakpoint_match_id_on_rule_change() {
    let state = build_state_for_app_tests();
    let id = Uuid::new_v4();
    state.push_traffic(sample_traffic_entry(id));

    let breakpoint_id = Uuid::new_v4();
    state.breakpoints.write().insert(
        0,
        BreakpointRule {
            id: breakpoint_id,
            name: "bp".to_string(),
            enabled: true,
            match_method: None,
            match_origin: Some("https://example.com".to_string()),
            match_path_regex: Some("/api".to_string()),
        },
    );
    state.recompute_rule_matches();
    assert_eq!(
        state
            .traffic
            .read()
            .iter()
            .find(|entry| entry.id == id)
            .and_then(|entry| entry.breakpoint_match_id),
        Some(breakpoint_id),
    );

    state.breakpoints.write().clear();
    state.recompute_rule_matches();
    assert_eq!(
        state
            .traffic
            .read()
            .iter()
            .find(|entry| entry.id == id)
            .and_then(|entry| entry.breakpoint_match_id),
        None,
    );
}

#[test]
fn recompute_ignores_connect_entries() {
    let state = build_state_for_app_tests();
    let id = Uuid::new_v4();
    let mut entry = sample_traffic_entry(id);
    entry.kind = TrafficKind::Connect;
    state.push_traffic(entry);

    state
        .overrides
        .write()
        .insert(0, rule_with("example.com", "/api"));
    state.recompute_rule_matches();
    assert_eq!(
        state
            .traffic
            .read()
            .iter()
            .find(|entry| entry.id == id)
            .and_then(|entry| entry.override_match_id.clone()),
        None,
    );
}

#[test]
fn breakpoint_method_match_is_case_insensitive_and_optional() {
    let rule = BreakpointRule {
        id: Uuid::new_v4(),
        name: "bp".to_string(),
        enabled: true,
        match_method: Some("POST".to_string()),
        match_origin: Some("https://example.com".to_string()),
        match_path_regex: Some("/api/v1".to_string()),
    };
    assert!(rule.matches("post", "https://example.com", "/api/v1"));
    assert!(!rule.matches("post", "https://example.com", "/api/v2"));
    assert!(!rule.matches("GET", "https://example.com", "/api/v1"));
}
