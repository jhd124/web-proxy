use crate::state::{AppState, BreakpointRule};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use sha2::{Digest, Sha256};
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

fn normalize_optional(input: Option<String>) -> Option<String> {
    input.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_method(input: Option<String>) -> Option<String> {
    normalize_optional(input).map(|value| value.to_ascii_uppercase())
}

fn normalize_origin(input: Option<String>) -> Option<String> {
    normalize_optional(input)
}

fn normalize_path_regex(input: Option<String>) -> Option<String> {
    normalize_optional(input)
}

fn breakpoint_identity_material(
    match_method: Option<&str>,
    match_origin: Option<&str>,
    match_path_regex: Option<&str>,
) -> String {
    // Canonical identity tuple: method (case-insensitive), origin (case-insensitive), path regex.
    // Each field occupies one fixed position; missing fields are encoded as empty strings.
    let method = match_method.unwrap_or("").trim().to_ascii_uppercase();
    let origin = match_origin.unwrap_or("").trim().to_ascii_lowercase();
    let path_regex = match_path_regex.unwrap_or("").trim();
    format!("method={method}\norigin={origin}\npath={path_regex}")
}

fn breakpoint_id_for_fields(
    match_method: Option<&str>,
    match_origin: Option<&str>,
    match_path_regex: Option<&str>,
) -> Uuid {
    let material = breakpoint_identity_material(match_method, match_origin, match_path_regex);
    let digest = Sha256::digest(material.as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    // UUIDv5-compatible layout for readability/interoperability, while keeping SHA-256 source.
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}

pub async fn list_breakpoints(State(state): State<Arc<AppState>>) -> Json<Vec<BreakpointRule>> {
    Json(state.breakpoints.read().clone())
}

pub async fn create_breakpoint(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UpsertBreakpointBody>,
) -> Result<Json<BreakpointRule>, StatusCode> {
    let match_method = normalize_method(body.match_method);
    let match_origin = normalize_origin(body.match_origin);
    let match_path_regex = normalize_path_regex(body.match_path_regex);
    let id = breakpoint_id_for_fields(
        match_method.as_deref(),
        match_origin.as_deref(),
        match_path_regex.as_deref(),
    );
    if state.breakpoints.read().iter().any(|rule| rule.id == id) {
        return Err(StatusCode::CONFLICT);
    }
    let rule = BreakpointRule {
        id,
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method,
        match_origin,
        match_path_regex,
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
    let match_method = normalize_method(body.match_method);
    let match_origin = normalize_origin(body.match_origin);
    let match_path_regex = normalize_path_regex(body.match_path_regex);
    let new_id = breakpoint_id_for_fields(
        match_method.as_deref(),
        match_origin.as_deref(),
        match_path_regex.as_deref(),
    );
    let updated = BreakpointRule {
        id: new_id,
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method,
        match_origin,
        match_path_regex,
    };
    let mut breakpoints = state.breakpoints.write();
    let pos = breakpoints
        .iter()
        .position(|r| r.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;
    if new_id != id && breakpoints.iter().any(|rule| rule.id == new_id) {
        return Err(StatusCode::CONFLICT);
    }
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
