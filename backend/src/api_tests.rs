use super::*;
use crate::state::{BreakpointRule, OverrideRule, TrafficEntry, TrafficKind};
use chrono::Utc;
use reqwest::Client;
use uuid::Uuid;

fn build_state() -> Arc<AppState> {
    Arc::new(AppState::new(
        128,
        None,
        None,
        std::env::temp_dir().join("proxy-app-test-overrides.sqlite"),
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
    state.push_traffic(sample_entry(id));
    let _resume_rx = state.register_pending_request(id);
    let _stream_rx = state.register_stream_controller(id, true);
    assert_eq!(state.traffic.read().len(), 1);
    assert_eq!(state.pending_requests.lock().len(), 1);
    assert_eq!(state.stream_controllers.lock().len(), 1);

    let status = clear_requests(State(state.clone())).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(state.traffic.read().is_empty());
    assert!(state.pending_requests.lock().is_empty());
    assert!(state.stream_controllers.lock().is_empty());
}
