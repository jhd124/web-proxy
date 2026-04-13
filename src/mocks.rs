use crate::state::{AppState, MockRule};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMockBody {
    pub name: String,
    pub enabled: Option<bool>,
    pub match_method: Option<String>,
    pub match_host: Option<String>,
    pub match_path_regex: Option<String>,
    pub status: u16,
    pub headers: Option<Vec<(String, String)>>,
    pub body: Option<String>,
    /// When set, body is split on blank lines and streamed with this interval (ms).
    pub stream_interval_ms: Option<u64>,
    /// When true, insert at the front so this rule wins over older matches.
    pub prepend: Option<bool>,
}

pub async fn list_mocks(State(state): State<std::sync::Arc<AppState>>) -> Json<Vec<MockRule>> {
    Json(state.mocks.read().clone())
}

pub async fn create_mock(
    State(state): State<std::sync::Arc<AppState>>,
    Json(body): Json<CreateMockBody>,
) -> Result<Json<MockRule>, StatusCode> {
    let rule = MockRule {
        id: Uuid::new_v4(),
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method: body.match_method,
        match_host: body.match_host,
        match_path_regex: body.match_path_regex,
        status: body.status,
        headers: body.headers.unwrap_or_default(),
        body: body.body.unwrap_or_default(),
        stream_interval_ms: body.stream_interval_ms,
    };
    let mut mocks = state.mocks.write();
    if body.prepend.unwrap_or(false) {
        mocks.insert(0, rule.clone());
    } else {
        mocks.push(rule.clone());
    }
    state.notify_mocks_changed();
    Ok(Json(rule))
}

pub async fn delete_mock(
    State(state): State<std::sync::Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> StatusCode {
    let mut m = state.mocks.write();
    let before = m.len();
    m.retain(|r| r.id != id);
    if m.len() < before {
        state.notify_mocks_changed();
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

pub async fn update_mock(
    State(state): State<std::sync::Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateMockBody>,
) -> Result<Json<MockRule>, StatusCode> {
    let mut m = state.mocks.write();
    let pos = m.iter().position(|r| r.id == id).ok_or(StatusCode::NOT_FOUND)?;
    let updated = MockRule {
        id,
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method: body.match_method,
        match_host: body.match_host,
        match_path_regex: body.match_path_regex,
        status: body.status,
        headers: body.headers.unwrap_or_default(),
        body: body.body.unwrap_or_default(),
        stream_interval_ms: body.stream_interval_ms,
    };
    m[pos] = updated.clone();
    drop(m);
    state.notify_mocks_changed();
    Ok(Json(updated))
}
