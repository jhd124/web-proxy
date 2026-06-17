use super::*;
use crate::state::{BreakpointRule, OverrideRule, TrafficEntry, TrafficKind};
use axum::routing::post;
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
    assert_eq!(state.traffic.read().len(), 1);
    assert!(state.traffic.read().capacity() > 0);
    assert_eq!(state.pending_requests.lock().len(), 1);
    assert_eq!(state.stream_controllers.lock().len(), 1);

    let status = clear_requests(State(state.clone())).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(state.traffic.read().is_empty());
    assert_eq!(state.traffic.read().capacity(), 0);
    assert!(state.pending_requests.lock().is_empty());
    assert!(state.stream_controllers.lock().is_empty());
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
