use super::*;
use crate::state::{BreakpointRule, OverrideRule, TrafficEntry, TrafficKind};
use axum::routing::{get, post};
use axum::Router;
use chrono::Utc;
use reqwest::Client;
use tokio::sync::oneshot;
use uuid::Uuid;

fn build_state() -> Arc<AppState> {
    let db_path = std::env::temp_dir().join(format!(
        "proxy-app-test-overrides-{}.sqlite",
        Uuid::new_v4()
    ));
    crate::saved_requests::init(&db_path).expect("init saved requests table");
    crate::request_catalog::init(&db_path).expect("init request catalog tables");
    crate::request_composer::init(&db_path).expect("init request composer tables");
    Arc::new(AppState::new(
        128,
        None,
        None,
        db_path,
        Vec::<OverrideRule>::new(),
        Vec::<BreakpointRule>::new(),
        Client::new(),
        None,
        false,
    ))
}

fn search_group_count(
    response: &crate::advanced_search::AdvancedSearchResponse,
    label: &str,
) -> usize {
    response
        .groups
        .iter()
        .find(|group| group.label == label)
        .map(|group| group.matches.len())
        .unwrap_or_default()
}

fn sample_entry(id: Uuid) -> TrafficEntry {
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
fn parse_non_loopback_ipv4_rejects_local_and_empty_values() {
    assert_eq!(
        parse_non_loopback_ipv4("192.168.31.24"),
        Some("192.168.31.24".parse().unwrap())
    );
    assert_eq!(parse_non_loopback_ipv4("127.0.0.1"), None);
    assert_eq!(parse_non_loopback_ipv4("0.0.0.0"), None);
    assert_eq!(parse_non_loopback_ipv4("not-an-ip"), None);
}

#[cfg(target_os = "macos")]
#[test]
fn parse_macos_wifi_device_finds_wifi_hardware_port() {
    let hardware_ports = r#"
Hardware Port: Thunderbolt Ethernet
Device: en7
Ethernet Address: aa:bb:cc:dd:ee:ff

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: 11:22:33:44:55:66

Hardware Port: Bluetooth PAN
Device: en5
Ethernet Address: 00:11:22:33:44:55
"#;

    assert_eq!(
        parse_macos_wifi_device(hardware_ports),
        Some("en0".to_string())
    );
}

#[tokio::test]
async fn pause_and_resume_capture_toggle_state() {
    let state = build_state();
    assert!(!state.is_capture_paused());

    let pause_status = pause_capture(State(state.clone())).await;
    assert_eq!(pause_status, StatusCode::NO_CONTENT);
    assert!(state.is_capture_paused());

    let resume_status = resume_capture(State(state.clone())).await;
    assert_eq!(resume_status, StatusCode::NO_CONTENT);
    assert!(!state.is_capture_paused());
}

#[tokio::test]
async fn set_system_proxy_disable_is_no_content() {
    let status = set_system_proxy(Json(SetSystemProxyBody {
        enabled: false,
        proxy_port: None,
    }))
    .await;

    assert_eq!(status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn set_system_proxy_enable_rejects_zero_port() {
    let status = set_system_proxy(Json(SetSystemProxyBody {
        enabled: true,
        proxy_port: Some(0),
    }))
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn resume_request_returns_not_found_when_missing_and_no_content_when_exists() {
    let state = build_state();
    let id = Uuid::new_v4();

    let missing_status = resume_request(axum::extract::Path(id), State(state.clone())).await;
    assert_eq!(missing_status, StatusCode::NOT_FOUND);

    let _rx = state.register_pending_request(id);
    let hit_status = resume_request(axum::extract::Path(id), State(state.clone())).await;
    assert_eq!(hit_status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn stream_play_pause_handlers_follow_controller_existence() {
    let state = build_state();
    let id = Uuid::new_v4();

    let missing_play_status = play_stream(axum::extract::Path(id), State(state.clone())).await;
    assert_eq!(missing_play_status, StatusCode::NOT_FOUND);
    let missing_pause_status = pause_stream(axum::extract::Path(id), State(state.clone())).await;
    assert_eq!(missing_pause_status, StatusCode::NOT_FOUND);

    let _ctrl = state.register_stream_controller(id, false);
    let play_status = play_stream(axum::extract::Path(id), State(state.clone())).await;
    assert_eq!(play_status, StatusCode::NO_CONTENT);
    let pause_status = pause_stream(axum::extract::Path(id), State(state.clone())).await;
    assert_eq!(pause_status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn clear_requests_clears_traffic_pending_and_stream_controllers() {
    let state = build_state();
    let id = Uuid::new_v4();
    state.traffic.write().reserve(64);
    state.push_traffic(sample_entry(id));
    let _resume_rx = state.register_pending_request(id);
    let _stream_rx = state.register_stream_controller(id, true);
    let preview_buffer = Arc::new(parking_lot::Mutex::new(vec![1, 2, 3]));
    state.register_stream_preview_buffer(id, preview_buffer.clone());
    assert_eq!(state.traffic.read().len(), 1);
    assert!(state.traffic.read().capacity() > 0);
    assert_eq!(state.pending_requests.lock().len(), 1);
    assert_eq!(state.stream_controllers.lock().len(), 1);
    assert_eq!(state.stream_preview_buffers.lock().len(), 1);

    let status = clear_requests(State(state.clone())).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(state.traffic.read().is_empty());
    assert_eq!(state.traffic.read().capacity(), 0);
    assert!(state.pending_requests.lock().is_empty());
    assert!(state.stream_controllers.lock().is_empty());
    assert!(state.stream_preview_buffers.lock().is_empty());
    assert!(preview_buffer.lock().is_empty());
}

#[tokio::test]
async fn list_requests_returns_summaries_and_detail_returns_full_entry() {
    let state = build_state();
    let id = Uuid::new_v4();
    let mut entry = sample_entry(id);
    entry.request_headers = vec![
        ("content-type".to_string(), "application/json".to_string()),
        ("user-agent".to_string(), "curl/8.0".to_string()),
    ];
    entry.request_body_preview = Some("{\"ok\":true}".to_string());
    entry.response_headers = Some(vec![(
        "content-type".to_string(),
        "application/json; charset=utf-8".to_string(),
    )]);
    entry.response_status = Some(200);
    entry.response_body_preview = Some("{\"done\":true}".to_string());
    state.push_traffic(entry);

    let summaries = list_requests(State(state.clone())).await.0;
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].id, id);
    assert_eq!(
        summaries[0].request_content_type.as_deref(),
        Some("application/json")
    );
    assert_eq!(
        summaries[0].response_content_type.as_deref(),
        Some("application/json; charset=utf-8")
    );
    assert_eq!(summaries[0].requester_app_name, "curl");
    assert_eq!(summaries[0].resource_type, "json");
    assert_eq!(summaries[0].method_tag, "GET");
    assert_eq!(summaries[0].status_class.as_deref(), Some("2xx"));
    assert!(summaries[0]
        .url_filter_text
        .contains("https://example.com/api"));
    assert!(summaries[0].search_text.contains("json"));

    let detail = request_detail(axum::extract::Path(id), State(state.clone()))
        .await
        .expect("request detail should exist")
        .0;
    assert_eq!(
        detail.request_body_preview.as_deref(),
        Some("{\"ok\":true}")
    );
    assert_eq!(
        detail.response_body_preview.as_deref(),
        Some("{\"done\":true}")
    );

    let missing = request_detail(axum::extract::Path(Uuid::new_v4()), State(state)).await;
    assert!(matches!(missing, Err(StatusCode::NOT_FOUND)));
}

#[tokio::test]
async fn advanced_search_matches_traffic_details() {
    let state = build_state();
    let id = Uuid::new_v4();
    let mut entry = sample_entry(id);
    entry.url = "https://example.com/search".to_string();
    entry.request_headers = vec![("x-request-id".to_string(), "needle-header".to_string())];
    entry.request_body_preview = Some("{\"token\":\"needle-body\"}".to_string());
    state.push_traffic(entry);

    let response = crate::advanced_search::search(
        axum::extract::Query(crate::advanced_search::AdvancedSearchQuery {
            q: "needle-body".to_string(),
        }),
        State(state),
    )
    .await
    .expect("search should succeed")
    .0;

    assert_eq!(search_group_count(&response, "traffic"), 1);
    assert_eq!(response.total, 1);
    let traffic_group = response
        .groups
        .iter()
        .find(|group| group.label == "traffic")
        .expect("traffic group exists");
    assert_eq!(traffic_group.matches[0].id, id.to_string());
    assert_eq!(traffic_group.matches[0].field, "request body");
}

#[tokio::test]
async fn advanced_search_matches_override_breakpoint_and_saved() {
    let state = build_state();
    state.overrides.write().push(OverrideRule {
        id: "override-id".to_string(),
        enabled: true,
        match_method: Some("POST".to_string()),
        match_protocol: Some("https".to_string()),
        match_host: Some("override.example.com".to_string()),
        match_path: Some("/from-override".to_string()),
        match_request_headers: vec![("x-mode".to_string(), "override-needle".to_string())],
        match_query: Vec::new(),
        match_request_body: None,
        status: 201,
        headers: Vec::new(),
        body: "override body".to_string(),
        map_remote_protocol: None,
        map_remote_host: None,
        map_remote_path: None,
        stream_interval_ms: None,
    });
    state.breakpoints.write().push(BreakpointRule {
        id: Uuid::new_v4(),
        name: "breakpoint needle".to_string(),
        enabled: true,
        match_method: Some("GET".to_string()),
        match_origin: Some("https://breakpoint.example.com".to_string()),
        match_path_regex: Some("/breakpoint".to_string()),
    });
    let mut saved_entry = sample_entry(Uuid::new_v4());
    saved_entry.url = "https://saved.example.com/search".to_string();
    saved_entry.response_body_preview = Some("saved needle body".to_string());
    let _saved = crate::saved_requests::save_request(State(state.clone()), axum::Json(saved_entry))
        .await
        .expect("save request should succeed");

    let override_response = crate::advanced_search::search(
        axum::extract::Query(crate::advanced_search::AdvancedSearchQuery {
            q: "override-needle".to_string(),
        }),
        State(state.clone()),
    )
    .await
    .expect("override search should succeed")
    .0;
    assert_eq!(search_group_count(&override_response, "override"), 1);

    let breakpoint_response = crate::advanced_search::search(
        axum::extract::Query(crate::advanced_search::AdvancedSearchQuery {
            q: "breakpoint needle".to_string(),
        }),
        State(state.clone()),
    )
    .await
    .expect("breakpoint search should succeed")
    .0;
    assert!(search_group_count(&breakpoint_response, "breakpoint") >= 1);

    let saved_response = crate::advanced_search::search(
        axum::extract::Query(crate::advanced_search::AdvancedSearchQuery {
            q: "saved needle".to_string(),
        }),
        State(state),
    )
    .await
    .expect("saved search should succeed")
    .0;
    assert!(search_group_count(&saved_response, "saved") >= 1);
}

#[tokio::test]
async fn advanced_search_empty_query_returns_empty_groups() {
    let response = crate::advanced_search::search(
        axum::extract::Query(crate::advanced_search::AdvancedSearchQuery {
            q: "  ".to_string(),
        }),
        State(build_state()),
    )
    .await
    .expect("empty search should succeed")
    .0;

    assert_eq!(response.total, 0);
    assert_eq!(response.groups.len(), 4);
    assert!(response.groups.iter().all(|group| group.matches.is_empty()));
}

#[tokio::test]
async fn advanced_search_keeps_up_to_four_thousand_matches_per_group() {
    let state = build_state();
    let mut entries = Vec::new();
    for index in 0..4_001 {
        let mut entry = sample_entry(Uuid::new_v4());
        entry.url = format!("https://example.com/needle/{index}");
        entries.push(entry);
    }
    *state.traffic.write() = entries;

    let response = crate::advanced_search::search(
        axum::extract::Query(crate::advanced_search::AdvancedSearchQuery {
            q: "needle".to_string(),
        }),
        State(state),
    )
    .await
    .expect("search should succeed")
    .0;

    assert_eq!(search_group_count(&response, "traffic"), 4_000);
}

#[tokio::test]
async fn replay_request_returns_not_found_for_missing_entry() {
    let state = build_state();
    let status = replay_request(axum::extract::Path(Uuid::new_v4()), State(state)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn replay_request_returns_bad_request_for_connect_entry() {
    let state = build_state();
    let id = Uuid::new_v4();
    let mut entry = sample_entry(id);
    entry.kind = TrafficKind::Connect;
    state.push_traffic(entry);

    let status = replay_request(axum::extract::Path(id), State(state)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn replay_request_replays_http_entry() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind test listener");
    let addr = listener.local_addr().expect("read test listener addr");
    let (request_seen_tx, request_seen_rx) = oneshot::channel::<()>();
    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(request_seen_tx)));
    let app = Router::new().route(
        "/replay",
        post({
            let tx = tx.clone();
            move || {
                let tx = tx.clone();
                async move {
                    if let Some(sender) = tx.lock().expect("lock replay tx").take() {
                        let _ = sender.send(());
                    }
                    StatusCode::NO_CONTENT
                }
            }
        }),
    );
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    let state = build_state();
    let id = Uuid::new_v4();
    let mut entry = sample_entry(id);
    entry.url = format!("http://{addr}/replay");
    entry.method = "POST".to_string();
    entry.request_body_preview = Some("{\"hello\":\"world\"}".to_string());
    entry.request_headers = vec![("content-type".to_string(), "application/json".to_string())];
    state.push_traffic(entry);

    let status = replay_request(axum::extract::Path(id), State(state)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let seen = tokio::time::timeout(std::time::Duration::from_secs(1), request_seen_rx).await;
    assert!(seen.is_ok(), "expected replay request to hit test server");
}

#[tokio::test]
async fn request_catalog_suggests_api_requests_and_skips_resources() {
    let state = build_state();
    let mut api_entry = sample_entry(Uuid::new_v4());
    api_entry.host = "api.example.com".to_string();
    api_entry.url = "https://api.example.com/api/users?page=1".to_string();
    api_entry.path = "/api/users".to_string();
    api_entry.response_status = Some(200);
    api_entry.response_headers = Some(vec![(
        "content-type".to_string(),
        "application/json".to_string(),
    )]);
    state.request_catalog.record_traffic_candidate(&api_entry);

    let mut js_entry = sample_entry(Uuid::new_v4());
    js_entry.host = "static.example.com".to_string();
    js_entry.url = "https://static.example.com/assets/app.js".to_string();
    js_entry.path = "/assets/app.js".to_string();
    js_entry.response_status = Some(200);
    js_entry.response_headers = Some(vec![(
        "content-type".to_string(),
        "application/javascript".to_string(),
    )]);
    state.request_catalog.record_traffic_candidate(&js_entry);

    let hosts = crate::request_catalog::suggest_hosts(
        axum::extract::Query(crate::request_catalog::PrefixSuggestQuery {
            prefix: String::new(),
            limit: 20,
        }),
        State(state.clone()),
    )
    .await
    .expect("suggest hosts should succeed")
    .0;
    assert_eq!(hosts.len(), 1);
    assert_eq!(hosts[0].value, "api.example.com");

    let template = crate::request_catalog::get_template(
        axum::extract::Query(crate::request_catalog::TemplateQuery {
            host: "api.example.com".to_string(),
            path: "/api/users".to_string(),
            method: "GET".to_string(),
        }),
        State(state),
    )
    .await
    .expect("template should exist")
    .0;
    assert_eq!(template.search_params_schema[0].key, "page");
    assert_eq!(template.search_params_schema[0].value_type, "number");
}

#[tokio::test]
async fn request_catalog_respects_sensitive_header_setting() {
    let state = build_state();
    let mut entry = sample_entry(Uuid::new_v4());
    entry.host = "headers.example.com".to_string();
    entry.url = "https://headers.example.com/api/token".to_string();
    entry.path = "/api/token".to_string();
    entry.response_status = Some(200);
    entry.response_headers = Some(vec![(
        "content-type".to_string(),
        "application/json".to_string(),
    )]);
    entry.request_headers = vec![
        ("authorization".to_string(), "Bearer secret".to_string()),
        ("x-trace-id".to_string(), "trace-1".to_string()),
    ];
    state.request_catalog.record_traffic_candidate(&entry);

    let template = crate::request_catalog::get_template(
        axum::extract::Query(crate::request_catalog::TemplateQuery {
            host: "headers.example.com".to_string(),
            path: "/api/token".to_string(),
            method: "GET".to_string(),
        }),
        State(state.clone()),
    )
    .await
    .expect("template should exist")
    .0;
    assert!(!template
        .headers
        .iter()
        .any(|(name, _)| name == "authorization"));
    assert!(template
        .headers
        .iter()
        .any(|(name, _)| name == "x-trace-id"));

    let saved_settings = crate::request_catalog::put_settings(
        State(state.clone()),
        axum::Json(crate::request_catalog::RequestCatalogSettings {
            persist_sensitive_headers: true,
        }),
    )
    .await
    .expect("settings save should succeed")
    .0;
    assert!(saved_settings.persist_sensitive_headers);

    entry.host = "headers-on.example.com".to_string();
    entry.url = "https://headers-on.example.com/api/token".to_string();
    state.request_catalog.record_traffic_candidate(&entry);
    let template_with_sensitive = crate::request_catalog::get_template(
        axum::extract::Query(crate::request_catalog::TemplateQuery {
            host: "headers-on.example.com".to_string(),
            path: "/api/token".to_string(),
            method: "GET".to_string(),
        }),
        State(state),
    )
    .await
    .expect("template should exist")
    .0;
    assert!(template_with_sensitive
        .headers
        .iter()
        .any(|(name, _)| name == "authorization"));
}

#[tokio::test]
async fn request_composer_sends_request_and_stores_history() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind composer test listener");
    let addr = listener.local_addr().expect("read test listener addr");
    let app = Router::new().route(
        "/api/composer",
        get(|| async {
            (
                StatusCode::OK,
                axum::Json(serde_json::json!({ "ok": true })),
            )
        }),
    );
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    let state = build_state();
    let response = crate::request_composer::send_request(
        State(state.clone()),
        axum::Json(crate::request_composer::RequestComposerRequest {
            scheme: "http".to_string(),
            host: addr.to_string(),
            path: "/api/composer".to_string(),
            method: "GET".to_string(),
            search_params: vec![("page".to_string(), "1".to_string())],
            headers: vec![("accept".to_string(), "application/json".to_string())],
            body: None,
        }),
    )
    .await
    .expect("composer send should succeed")
    .0;
    assert_eq!(response.response.status, Some(200));
    assert!(response
        .response
        .body_preview
        .as_deref()
        .unwrap_or_default()
        .contains("ok"));

    let history = crate::request_composer::list_history(
        axum::extract::Query(crate::request_composer::HistoryQuery {
            limit: 10,
            offset: 0,
            q: String::new(),
        }),
        State(state.clone()),
    )
    .await
    .expect("history list should succeed")
    .0;
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, response.history_id);

    let detail = crate::request_composer::history_detail(
        axum::extract::Path(response.history_id),
        State(state),
    )
    .await
    .expect("history detail should succeed")
    .0;
    assert_eq!(detail.request.search_params[0].0, "page");
    assert_eq!(detail.response.status, Some(200));
}

#[tokio::test]
async fn create_breakpoint_persists_match_method() {
    let state = build_state();
    let body = crate::breakpoints::UpsertBreakpointBody {
        name: "Pause POST".to_string(),
        enabled: Some(true),
        match_method: Some("POST".to_string()),
        match_origin: Some("https://example.com".to_string()),
        match_path_regex: Some("/api".to_string()),
    };
    let created = crate::breakpoints::create_breakpoint(State(state.clone()), axum::Json(body))
        .await
        .expect("create breakpoint should succeed");
    assert_eq!(created.0.match_method.as_deref(), Some("POST"));
    let rules = state.breakpoints.read();
    assert_eq!(rules.len(), 1);
    assert_eq!(rules[0].match_method.as_deref(), Some("POST"));
}

#[tokio::test]
async fn create_breakpoint_persists_to_disk() {
    let state = build_state();
    let body = crate::breakpoints::UpsertBreakpointBody {
        name: "Pause persisted".to_string(),
        enabled: Some(true),
        match_method: Some("GET".to_string()),
        match_origin: Some("https://example.com".to_string()),
        match_path_regex: Some("/persist".to_string()),
    };
    let created = crate::breakpoints::create_breakpoint(State(state.clone()), axum::Json(body))
        .await
        .expect("create breakpoint should succeed");
    let loaded =
        crate::breakpoints::load_breakpoints(&state.override_db_path).expect("load breakpoints");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, created.0.id);
    assert_eq!(loaded[0].match_method.as_deref(), Some("GET"));
}

#[tokio::test]
async fn create_breakpoint_conflicts_on_same_method_origin_path() {
    let state = build_state();
    let first_body = crate::breakpoints::UpsertBreakpointBody {
        name: "Pause POST".to_string(),
        enabled: Some(true),
        match_method: Some("POST".to_string()),
        match_origin: Some("https://example.com".to_string()),
        match_path_regex: Some("/api".to_string()),
    };
    let created =
        crate::breakpoints::create_breakpoint(State(state.clone()), axum::Json(first_body))
            .await
            .expect("first breakpoint should be created");
    assert_eq!(created.0.match_method.as_deref(), Some("POST"));

    // Same identity tuple (method+origin+path), only different case/whitespace.
    let duplicate_body = crate::breakpoints::UpsertBreakpointBody {
        name: "Pause duplicate".to_string(),
        enabled: Some(false),
        match_method: Some("  post  ".to_string()),
        match_origin: Some(" HTTPS://EXAMPLE.COM ".to_string()),
        match_path_regex: Some("/api".to_string()),
    };
    let err =
        crate::breakpoints::create_breakpoint(State(state.clone()), axum::Json(duplicate_body))
            .await
            .expect_err("duplicate identity should conflict");
    assert_eq!(err, StatusCode::CONFLICT);
}

#[tokio::test]
async fn update_breakpoint_conflicts_when_identity_collides() {
    let state = build_state();
    let first = crate::breakpoints::create_breakpoint(
        State(state.clone()),
        axum::Json(crate::breakpoints::UpsertBreakpointBody {
            name: "Pause API".to_string(),
            enabled: Some(true),
            match_method: Some("GET".to_string()),
            match_origin: Some("https://example.com".to_string()),
            match_path_regex: Some("/api".to_string()),
        }),
    )
    .await
    .expect("create first breakpoint");
    let second = crate::breakpoints::create_breakpoint(
        State(state.clone()),
        axum::Json(crate::breakpoints::UpsertBreakpointBody {
            name: "Pause Login".to_string(),
            enabled: Some(true),
            match_method: Some("POST".to_string()),
            match_origin: Some("https://example.com".to_string()),
            match_path_regex: Some("/login".to_string()),
        }),
    )
    .await
    .expect("create second breakpoint");

    let err = crate::breakpoints::update_breakpoint(
        State(state.clone()),
        axum::extract::Path(second.0.id),
        axum::Json(crate::breakpoints::UpsertBreakpointBody {
            name: "Conflict target".to_string(),
            enabled: Some(true),
            match_method: first.0.match_method.clone(),
            match_origin: first.0.match_origin.clone(),
            match_path_regex: first.0.match_path_regex.clone(),
        }),
    )
    .await
    .expect_err("updating identity to existing one should conflict");
    assert_eq!(err, StatusCode::CONFLICT);
}

#[tokio::test]
async fn update_breakpoint_keeps_same_id_when_match_fields_change() {
    let state = build_state();
    let created = crate::breakpoints::create_breakpoint(
        State(state.clone()),
        axum::Json(crate::breakpoints::UpsertBreakpointBody {
            name: "Pause API".to_string(),
            enabled: Some(true),
            match_method: Some("GET".to_string()),
            match_origin: Some("https://example.com".to_string()),
            match_path_regex: Some("/api".to_string()),
        }),
    )
    .await
    .expect("create breakpoint");

    let updated = crate::breakpoints::update_breakpoint(
        State(state.clone()),
        axum::extract::Path(created.0.id),
        axum::Json(crate::breakpoints::UpsertBreakpointBody {
            name: "Pause Login".to_string(),
            enabled: Some(false),
            match_method: Some("POST".to_string()),
            match_origin: Some("https://example.com".to_string()),
            match_path_regex: Some("/login".to_string()),
        }),
    )
    .await
    .expect("update breakpoint");

    assert_eq!(updated.0.id, created.0.id);
    assert_eq!(updated.0.name, "Pause Login");
    assert_eq!(updated.0.match_method.as_deref(), Some("POST"));
    assert_eq!(updated.0.match_path_regex.as_deref(), Some("/login"));
}

#[tokio::test]
async fn update_breakpoint_persists_match_method_to_disk() {
    let state = build_state();
    let created = crate::breakpoints::create_breakpoint(
        State(state.clone()),
        axum::Json(crate::breakpoints::UpsertBreakpointBody {
            name: "Pause API".to_string(),
            enabled: Some(true),
            match_method: Some("GET".to_string()),
            match_origin: Some("https://example.com".to_string()),
            match_path_regex: Some("/api".to_string()),
        }),
    )
    .await
    .expect("create breakpoint");

    let _ = crate::breakpoints::update_breakpoint(
        State(state.clone()),
        axum::extract::Path(created.0.id),
        axum::Json(crate::breakpoints::UpsertBreakpointBody {
            name: "Pause Login".to_string(),
            enabled: Some(true),
            match_method: Some("POST".to_string()),
            match_origin: Some("https://example.com".to_string()),
            match_path_regex: Some("/login".to_string()),
        }),
    )
    .await
    .expect("update breakpoint");

    let loaded =
        crate::breakpoints::load_breakpoints(&state.override_db_path).expect("load breakpoints");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].match_method.as_deref(), Some("POST"));
}

fn sample_override_body(match_method: &str) -> crate::overrides::UpsertOverrideBody {
    crate::overrides::UpsertOverrideBody {
        enabled: Some(true),
        match_method: Some(match_method.to_string()),
        match_protocol: Some("https".to_string()),
        match_host: Some("example.com".to_string()),
        match_path: Some("/api".to_string()),
        match_request_headers: None,
        match_query: None,
        match_request_body: None,
        status: 200,
        headers: None,
        body: Some("ok".to_string()),
        map_remote_protocol: None,
        map_remote_host: None,
        map_remote_path: None,
        stream_interval_ms: None,
    }
}

#[tokio::test]
async fn update_override_persists_match_method_to_disk() {
    let state = build_state();
    crate::overrides::init_and_load(&state.override_db_path).expect("init overrides table");
    let created = crate::overrides::create_override(
        State(state.clone()),
        axum::Json(sample_override_body("POST")),
    )
    .await
    .expect("create override");

    let mut update_body = sample_override_body("POST");
    update_body.body = Some("updated body".to_string());
    let _ = crate::overrides::update_override(
        State(state.clone()),
        axum::extract::Path(created.0.id.clone()),
        axum::Json(update_body),
    )
    .await
    .expect("update override");

    let loaded = crate::overrides::init_and_load(&state.override_db_path).expect("load overrides");
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].match_method.as_deref(), Some("POST"));
    assert_eq!(loaded[0].body, "updated body");
}
