use crate::state::{AppState, OverrideRule};
use anyhow::Context;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::Path as StdPath;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertOverrideBody {
    pub name: String,
    pub enabled: Option<bool>,
    pub match_method: Option<String>,
    pub match_host: Option<String>,
    pub match_path: Option<String>,
    pub status: u16,
    pub headers: Option<Vec<(String, String)>>,
    pub body: Option<String>,
    pub stream_interval_ms: Option<u64>,
}

pub fn init_and_load(path: &StdPath) -> anyhow::Result<Vec<OverrideRule>> {
    let conn = Connection::open(path).with_context(|| format!("open sqlite {}", path.display()))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS overrides (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            match_method TEXT,
            match_host TEXT,
            match_path_regex TEXT,
            status INTEGER NOT NULL,
            headers_json TEXT NOT NULL,
            body TEXT NOT NULL,
            stream_interval_ms INTEGER
        );
        "#,
    )
    .context("create overrides table")?;
    load_all_from_conn(&conn)
}

/// Historically the column held regex; we now store a plain path. Legacy `^/p$` loads as `/p`.
fn path_from_stored_column(raw: Option<String>) -> Option<String> {
    let raw = raw?;
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    let t = s.to_string();
    if t.len() >= 2 && t.starts_with('^') && t.ends_with('$') {
        let inner = t[1..t.len() - 1].to_string();
        if !inner.is_empty() {
            return Some(inner);
        }
    }
    Some(t)
}

fn load_all_from_conn(conn: &Connection) -> anyhow::Result<Vec<OverrideRule>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
            id,
            name,
            enabled,
            match_method,
            match_host,
            match_path_regex,
            status,
            headers_json,
            body,
            stream_interval_ms
        FROM overrides
        ORDER BY rowid DESC
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        let headers_json: String = row.get(7)?;
        let headers = serde_json::from_str::<Vec<(String, String)>>(&headers_json).unwrap_or_default();
        let id: String = row.get(0)?;
        Ok(OverrideRule {
            id: Uuid::parse_str(&id).unwrap_or_else(|_| Uuid::nil()),
            name: row.get(1)?,
            enabled: row.get::<_, i64>(2)? != 0,
            match_method: row.get(3)?,
            match_host: row.get(4)?,
            match_path: path_from_stored_column(row.get(5)?),
            status: row.get(6)?,
            headers,
            body: row.get(8)?,
            stream_interval_ms: row.get(9)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        let item = row?;
        if item.id != Uuid::nil() {
            out.push(item);
        }
    }
    Ok(out)
}

fn insert_override(path: &StdPath, rule: &OverrideRule) -> anyhow::Result<()> {
    let conn = Connection::open(path)?;
    let headers_json = serde_json::to_string(&rule.headers)?;
    conn.execute(
        r#"
        INSERT INTO overrides (
            id, name, enabled, match_method, match_host, match_path_regex,
            status, headers_json, body, stream_interval_ms
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            rule.id.to_string(),
            rule.name,
            if rule.enabled { 1 } else { 0 },
            rule.match_method,
            rule.match_host,
            rule.match_path,
            rule.status,
            headers_json,
            rule.body,
            rule.stream_interval_ms,
        ],
    )?;
    Ok(())
}

fn update_override_row(path: &StdPath, rule: &OverrideRule) -> anyhow::Result<bool> {
    let conn = Connection::open(path)?;
    let headers_json = serde_json::to_string(&rule.headers)?;
    let changed = conn.execute(
        r#"
        UPDATE overrides
        SET
            name = ?2,
            enabled = ?3,
            match_method = ?4,
            match_host = ?5,
            match_path_regex = ?6,
            status = ?7,
            headers_json = ?8,
            body = ?9,
            stream_interval_ms = ?10
        WHERE id = ?1
        "#,
        params![
            rule.id.to_string(),
            rule.name,
            if rule.enabled { 1 } else { 0 },
            rule.match_method,
            rule.match_host,
            rule.match_path,
            rule.status,
            headers_json,
            rule.body,
            rule.stream_interval_ms,
        ],
    )?;
    Ok(changed > 0)
}

fn delete_override_row(path: &StdPath, id: Uuid) -> anyhow::Result<bool> {
    let conn = Connection::open(path)?;
    let changed = conn.execute("DELETE FROM overrides WHERE id = ?1", params![id.to_string()])?;
    Ok(changed > 0)
}

pub async fn list_overrides(State(state): State<Arc<AppState>>) -> Json<Vec<OverrideRule>> {
    Json(state.overrides.read().clone())
}

pub async fn create_override(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UpsertOverrideBody>,
) -> Result<Json<OverrideRule>, StatusCode> {
    let rule = OverrideRule {
        id: Uuid::new_v4(),
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method: body.match_method,
        match_host: body.match_host,
        match_path: body.match_path,
        status: body.status,
        headers: body.headers.unwrap_or_default(),
        body: body.body.unwrap_or_default(),
        stream_interval_ms: body.stream_interval_ms,
    };
    insert_override(&state.override_db_path, &rule).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    state.overrides.write().insert(0, rule.clone());
    state.notify_overrides_changed();
    Ok(Json(rule))
}

pub async fn update_override(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpsertOverrideBody>,
) -> Result<Json<OverrideRule>, StatusCode> {
    let updated = OverrideRule {
        id,
        name: body.name,
        enabled: body.enabled.unwrap_or(true),
        match_method: body.match_method,
        match_host: body.match_host,
        match_path: body.match_path,
        status: body.status,
        headers: body.headers.unwrap_or_default(),
        body: body.body.unwrap_or_default(),
        stream_interval_ms: body.stream_interval_ms,
    };
    if !update_override_row(&state.override_db_path, &updated).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        return Err(StatusCode::NOT_FOUND);
    }
    let mut overrides = state.overrides.write();
    let pos = overrides.iter().position(|r| r.id == id).ok_or(StatusCode::NOT_FOUND)?;
    overrides[pos] = updated.clone();
    drop(overrides);
    state.notify_overrides_changed();
    Ok(Json(updated))
}

pub async fn delete_override(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> StatusCode {
    match delete_override_row(&state.override_db_path, id) {
        Ok(true) => {
            state.overrides.write().retain(|r| r.id != id);
            state.notify_overrides_changed();
            StatusCode::NO_CONTENT
        }
        Ok(false) => StatusCode::NOT_FOUND,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
