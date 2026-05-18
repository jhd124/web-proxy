use crate::state::{AppState, SavedRequest, TrafficEntry};
use anyhow::Context;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::Path as StdPath;
use std::sync::Arc;
use uuid::Uuid;

pub fn init(path: &StdPath) -> anyhow::Result<()> {
    let conn = Connection::open(path).with_context(|| format!("open sqlite {}", path.display()))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS saved_requests (
            id TEXT PRIMARY KEY NOT NULL,
            saved_at TEXT NOT NULL,
            entry_json TEXT NOT NULL
        );
        "#,
    )
    .context("create saved_requests table")?;
    Ok(())
}

fn load_all(path: &StdPath) -> anyhow::Result<Vec<SavedRequest>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        r#"
        SELECT id, saved_at, entry_json
        FROM saved_requests
        ORDER BY saved_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let saved_at: String = row.get(1)?;
        let entry_json: String = row.get(2)?;
        Ok((id, saved_at, entry_json))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (id, saved_at, entry_json) = row?;
        let request = SavedRequest {
            id: Uuid::parse_str(&id)?,
            saved_at: saved_at.parse()?,
            entry: serde_json::from_str(&entry_json)?,
        };
        out.push(request);
    }
    Ok(out)
}

fn upsert(path: &StdPath, entry: &TrafficEntry) -> anyhow::Result<SavedRequest> {
    let conn = Connection::open(path)?;
    let request = SavedRequest {
        id: entry.id,
        saved_at: Utc::now(),
        entry: entry.clone(),
    };
    let entry_json = serde_json::to_string(&request.entry)?;
    conn.execute(
        r#"
        INSERT INTO saved_requests (id, saved_at, entry_json)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(id) DO UPDATE SET
            saved_at = excluded.saved_at,
            entry_json = excluded.entry_json
        "#,
        params![
            request.id.to_string(),
            request.saved_at.to_rfc3339(),
            entry_json
        ],
    )?;
    Ok(request)
}

fn delete_row(path: &StdPath, id: Uuid) -> anyhow::Result<bool> {
    let conn = Connection::open(path)?;
    let changed = conn.execute(
        "DELETE FROM saved_requests WHERE id = ?1",
        params![id.to_string()],
    )?;
    Ok(changed > 0)
}

fn delete_all(path: &StdPath) -> anyhow::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute("DELETE FROM saved_requests", [])?;
    Ok(())
}

pub async fn list_saved_requests(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<SavedRequest>>, StatusCode> {
    load_all(&state.override_db_path)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn save_request(
    State(state): State<Arc<AppState>>,
    Json(entry): Json<TrafficEntry>,
) -> Result<Json<SavedRequest>, StatusCode> {
    upsert(&state.override_db_path, &entry)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn delete_saved_request(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> StatusCode {
    match delete_row(&state.override_db_path, id) {
        Ok(true) => StatusCode::NO_CONTENT,
        Ok(false) => StatusCode::NOT_FOUND,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

pub async fn clear_saved_requests(State(state): State<Arc<AppState>>) -> StatusCode {
    match delete_all(&state.override_db_path) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
