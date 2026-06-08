use crate::state::{AppState, BreakpointRule};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertBreakpointBody {
    pub name: String,
    pub enabled: Option<bool>,
    pub match_method: Option<String>,
    pub match_origin: Option<String>,
    pub match_path_regex: Option<String>,
}

pub async fn list_breakpoints(State(state): State<Arc<AppState>>) -> Json<Vec<BreakpointRule>> {
    Json(state.breakpoints.read().clone())
}

pub async fn create_breakpoint(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UpsertBreakpointBody>,
) -> Result<Json<BreakpointRule>, StatusCode> {
    let rule = BreakpointRule {
        id: Uuid::new_v4(),
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method: body.match_method.as_ref().and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }),
        match_origin: body.match_origin,
        match_path_regex: body.match_path_regex,
    };
    state.breakpoints.write().insert(0, rule.clone());
    state.notify_breakpoints_changed();
    Ok(Json(rule))
}

pub async fn update_breakpoint(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpsertBreakpointBody>,
) -> Result<Json<BreakpointRule>, StatusCode> {
    let updated = BreakpointRule {
        id,
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method: body.match_method.as_ref().and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }),
        match_origin: body.match_origin,
        match_path_regex: body.match_path_regex,
    };
    let mut breakpoints = state.breakpoints.write();
    let pos = breakpoints
        .iter()
        .position(|r| r.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;
    breakpoints[pos] = updated.clone();
    drop(breakpoints);
    state.notify_breakpoints_changed();
    Ok(Json(updated))
}

pub async fn delete_breakpoint(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> StatusCode {
    let mut breakpoints = state.breakpoints.write();
    let before = breakpoints.len();
    breakpoints.retain(|r| r.id != id);
    if breakpoints.len() < before {
        drop(breakpoints);
        state.notify_breakpoints_changed();
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}
