use crate::state::{AppState, BreakpointRule};
use anyhow::Context;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use std::fs;
use std::path::{Path as StdPath, PathBuf};
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
    // Canonical identity tuple: method (case-insensitive), origin (case-insensitive), path string.
    // Each field occupies one fixed position; missing fields are encoded as empty strings.
    let method = match_method.unwrap_or("").trim().to_ascii_uppercase();
    let origin = match_origin.unwrap_or("").trim().to_ascii_lowercase();
    let path = match_path_regex.unwrap_or("").trim();
    format!("method={method}\norigin={origin}\npath={path}")
}

fn breakpoint_identity_material_from_rule(rule: &BreakpointRule) -> String {
    breakpoint_identity_material(
        rule.match_method.as_deref(),
        rule.match_origin.as_deref(),
        rule.match_path_regex.as_deref(),
    )
}

fn has_duplicate_breakpoint(
    rules: &[BreakpointRule],
    candidate_identity: &str,
    exclude_id: Option<Uuid>,
) -> bool {
    rules.iter().any(|rule| {
        if exclude_id.is_some_and(|id| id == rule.id) {
            return false;
        }
        breakpoint_identity_material_from_rule(rule) == candidate_identity
    })
}

fn breakpoints_store_path(override_db_path: &StdPath) -> PathBuf {
    override_db_path.with_extension("breakpoints.json")
}

pub fn load_breakpoints(override_db_path: &StdPath) -> anyhow::Result<Vec<BreakpointRule>> {
    let path = breakpoints_store_path(override_db_path);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content =
        fs::read_to_string(&path).with_context(|| format!("read breakpoints: {}", path.display()))?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    let rules: Vec<BreakpointRule> = serde_json::from_str(&content)
        .with_context(|| format!("parse breakpoints json: {}", path.display()))?;
    Ok(rules)
}

fn save_breakpoints(override_db_path: &StdPath, rules: &[BreakpointRule]) -> anyhow::Result<()> {
    let path = breakpoints_store_path(override_db_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create breakpoints dir: {}", parent.display()))?;
    }
    let tmp_path = path.with_extension(format!("breakpoints.json.tmp.{}", Uuid::new_v4()));
    let payload = serde_json::to_vec_pretty(rules).context("serialize breakpoints json")?;
    fs::write(&tmp_path, payload)
        .with_context(|| format!("write breakpoints temp file: {}", tmp_path.display()))?;
    fs::rename(&tmp_path, &path).with_context(|| {
        format!(
            "replace breakpoints file: {} -> {}",
            tmp_path.display(),
            path.display()
        )
    })?;
    Ok(())
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
    let candidate_identity = breakpoint_identity_material(
        match_method.as_deref(),
        match_origin.as_deref(),
        match_path_regex.as_deref(),
    );
    let breakpoints = state.breakpoints.read();
    if has_duplicate_breakpoint(&breakpoints, &candidate_identity, None) {
        return Err(StatusCode::CONFLICT);
    }
    drop(breakpoints);
    let rule = BreakpointRule {
        id: Uuid::new_v4(),
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method,
        match_origin,
        match_path_regex,
    };
    let mut breakpoints = state.breakpoints.write();
    breakpoints.insert(0, rule.clone());
    if let Err(error) = save_breakpoints(&state.override_db_path, &breakpoints) {
        breakpoints.remove(0);
        tracing::error!("persist breakpoints after create failed: {}", error);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    drop(breakpoints);
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
    let candidate_identity = breakpoint_identity_material(
        match_method.as_deref(),
        match_origin.as_deref(),
        match_path_regex.as_deref(),
    );
    let updated = BreakpointRule {
        id,
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
    if has_duplicate_breakpoint(&breakpoints, &candidate_identity, Some(id)) {
        return Err(StatusCode::CONFLICT);
    }
    let previous = breakpoints[pos].clone();
    breakpoints[pos] = updated.clone();
    if let Err(error) = save_breakpoints(&state.override_db_path, &breakpoints) {
        breakpoints[pos] = previous;
        tracing::error!("persist breakpoints after update failed: {}", error);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    drop(breakpoints);
    state.notify_breakpoints_changed();
    Ok(Json(updated))
}

pub async fn delete_breakpoint(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> StatusCode {
    let mut breakpoints = state.breakpoints.write();
    let Some(pos) = breakpoints.iter().position(|r| r.id == id) else {
        return StatusCode::NOT_FOUND;
    };
    let removed = breakpoints.remove(pos);
    if let Err(error) = save_breakpoints(&state.override_db_path, &breakpoints) {
        breakpoints.insert(pos, removed);
        tracing::error!("persist breakpoints after delete failed: {}", error);
        return StatusCode::INTERNAL_SERVER_ERROR;
    }
    drop(breakpoints);
    state.notify_breakpoints_changed();
    StatusCode::NO_CONTENT
}
