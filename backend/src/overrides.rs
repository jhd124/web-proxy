use crate::override_identity::override_id_for_rule;
use crate::state::{AppState, OverrideRule};
use anyhow::Context;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use rusqlite::ErrorCode;
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::Path as StdPath;
use std::sync::Arc;

/// SQLite enforces `id` as the primary key: duplicate inserts fail; see `init_and_load` DDL.
#[derive(Debug)]
enum InsertOverrideError {
    Serde(#[allow(dead_code)] serde_json::Error),
    Sqlite(#[allow(dead_code)] rusqlite::Error),
    /// `UNIQUE` / `PRIMARY KEY` violation on `id`
    DuplicateId,
}

impl From<InsertOverrideError> for StatusCode {
    fn from(e: InsertOverrideError) -> Self {
        match e {
            InsertOverrideError::DuplicateId => StatusCode::CONFLICT,
            InsertOverrideError::Serde(_) | InsertOverrideError::Sqlite(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertOverrideBody {
    pub enabled: Option<bool>,
    pub match_protocol: Option<String>,
    pub match_host: Option<String>,
    pub match_path: Option<String>,
    pub match_request_headers: Option<Vec<(String, String)>>,
    pub match_query: Option<Vec<(String, String)>>,
    pub match_request_body: Option<String>,
    pub status: u16,
    pub headers: Option<Vec<(String, String)>>,
    pub body: Option<String>,
    pub map_remote_protocol: Option<String>,
    pub map_remote_host: Option<String>,
    pub map_remote_path: Option<String>,
    pub stream_interval_ms: Option<u64>,
}

fn validate_upsert(body: &UpsertOverrideBody) -> Result<(), StatusCode> {
    if !body
        .match_host
        .as_ref()
        .is_some_and(|h| !h.trim().is_empty())
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}

fn rule_from_body(body: &UpsertOverrideBody, id: String) -> OverrideRule {
    OverrideRule {
        id,
        enabled: body.enabled.unwrap_or(true),
        match_protocol: body.match_protocol.clone(),
        match_host: body.match_host.as_ref().map(|s| s.trim().to_string()),
        match_path: body.match_path.clone(),
        match_request_headers: body.match_request_headers.clone().unwrap_or_default(),
        match_query: body.match_query.clone().unwrap_or_default(),
        match_request_body: body.match_request_body.clone(),
        status: body.status,
        headers: body.headers.clone().unwrap_or_default(),
        body: body.body.clone().unwrap_or_default(),
        map_remote_protocol: body.map_remote_protocol.as_ref().and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }),
        map_remote_host: body.map_remote_host.as_ref().and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }),
        map_remote_path: body.map_remote_path.as_ref().and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }),
        stream_interval_ms: body.stream_interval_ms,
    }
}

fn ensure_overrides_schema(conn: &Connection) -> rusqlite::Result<()> {
    let mut cols: Vec<String> = conn
        .prepare("SELECT name FROM pragma_table_info('overrides')")?
        .query_map([], |r| r.get::<_, String>(0))?
        .filter_map(|x| x.ok())
        .collect();
    cols.sort();
    let has = |c: &str| cols.iter().any(|x| x == c);
    if !has("match_protocol") {
        conn.execute("ALTER TABLE overrides ADD COLUMN match_protocol TEXT", [])?;
    }
    if !has("match_request_headers_json") {
        conn.execute(
            "ALTER TABLE overrides ADD COLUMN match_request_headers_json TEXT DEFAULT '[]'",
            [],
        )?;
    }
    if !has("match_query_json") {
        conn.execute(
            "ALTER TABLE overrides ADD COLUMN match_query_json TEXT DEFAULT '[]'",
            [],
        )?;
    }
    if !has("match_request_body") {
        conn.execute(
            "ALTER TABLE overrides ADD COLUMN match_request_body TEXT",
            [],
        )?;
    }
    if !has("map_remote_url") {
        conn.execute("ALTER TABLE overrides ADD COLUMN map_remote_url TEXT", [])?;
    }
    if !has("map_remote_protocol") {
        conn.execute("ALTER TABLE overrides ADD COLUMN map_remote_protocol TEXT", [])?;
    }
    if !has("map_remote_host") {
        conn.execute("ALTER TABLE overrides ADD COLUMN map_remote_host TEXT", [])?;
    }
    if !has("map_remote_path") {
        conn.execute("ALTER TABLE overrides ADD COLUMN map_remote_path TEXT", [])?;
    }
    Ok(())
}

fn map_remote_rule_from_legacy_url(
    legacy_url: Option<String>,
) -> (Option<String>, Option<String>, Option<String>) {
    let Some(raw) = legacy_url else {
        return (None, None, None);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return (None, None, None);
    }
    if let Ok(url) = url::Url::parse(trimmed) {
        let protocol = Some(url.scheme().to_string());
        let host = url.host_str().map(|h| {
            if let Some(port) = url.port() {
                format!("{h}:{port}")
            } else {
                h.to_string()
            }
        });
        let path = match url.query() {
            Some(q) => Some(format!("{}?{}", url.path(), q)),
            None => Some(url.path().to_string()),
        };
        return (protocol, host, path);
    }
    (None, None, None)
}

pub fn init_and_load(path: &StdPath) -> anyhow::Result<Vec<OverrideRule>> {
    let conn = Connection::open(path).with_context(|| format!("open sqlite {}", path.display()))?;
    conn.execute_batch(
        r#"
        -- `id` is the sole primary key; must be unique. `match_method` is unused (left for old DBs).
        CREATE TABLE IF NOT EXISTS overrides (
            id TEXT PRIMARY KEY NOT NULL,
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
    ensure_overrides_schema(&conn).context("migrate overrides table")?;
    load_all_from_conn(&conn)
}

/// The path column used to store regex; we now store a plain path. Old `^/p$` loads as `/p`.
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
            enabled,
            match_host,
            match_path_regex,
            match_protocol,
            match_request_headers_json,
            match_query_json,
            match_request_body,
            status,
            headers_json,
            body,
            map_remote_protocol,
            map_remote_host,
            map_remote_path,
            map_remote_url,
            stream_interval_ms
        FROM overrides
        ORDER BY rowid DESC
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        let headers_json: String = row.get(9)?;
        let headers =
            serde_json::from_str::<Vec<(String, String)>>(&headers_json).unwrap_or_default();
        let mrh: String = row
            .get::<_, Option<String>>(5)
            .ok()
            .flatten()
            .unwrap_or_else(|| "[]".to_string());
        let mq: String = row
            .get::<_, Option<String>>(6)
            .ok()
            .flatten()
            .unwrap_or_else(|| "[]".to_string());
        let match_request_headers =
            serde_json::from_str::<Vec<(String, String)>>(&mrh).unwrap_or_default();
        let match_query = serde_json::from_str::<Vec<(String, String)>>(&mq).unwrap_or_default();
        let id: String = row.get(0)?;
        let mut map_remote_protocol: Option<String> = row.get(11)?;
        let mut map_remote_host: Option<String> = row.get(12)?;
        let mut map_remote_path: Option<String> = row.get(13)?;
        if map_remote_protocol
            .as_deref()
            .map(str::trim)
            .map(|v| v.is_empty())
            .unwrap_or(true)
            || map_remote_host
                .as_deref()
                .map(str::trim)
                .map(|v| v.is_empty())
                .unwrap_or(true)
        {
            let (legacy_protocol, legacy_host, legacy_path) =
                map_remote_rule_from_legacy_url(row.get(14)?);
            if map_remote_protocol.is_none() {
                map_remote_protocol = legacy_protocol;
            }
            if map_remote_host.is_none() {
                map_remote_host = legacy_host;
            }
            if map_remote_path.is_none() {
                map_remote_path = legacy_path;
            }
        }
        Ok(OverrideRule {
            id,
            enabled: row.get::<_, i64>(1)? != 0,
            match_host: row.get(2)?,
            match_path: path_from_stored_column(row.get(3)?),
            match_protocol: row.get(4)?,
            match_request_headers,
            match_query,
            match_request_body: row.get(7)?,
            status: row.get(8)?,
            headers,
            body: row.get(10)?,
            map_remote_protocol,
            map_remote_host,
            map_remote_path,
            stream_interval_ms: row.get::<_, Option<i64>>(15)?.map(|x| x as u64),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn insert_override(path: &StdPath, rule: &OverrideRule) -> Result<(), InsertOverrideError> {
    let conn = Connection::open(path).map_err(InsertOverrideError::Sqlite)?;
    let headers_json = serde_json::to_string(&rule.headers).map_err(InsertOverrideError::Serde)?;
    let mrh =
        serde_json::to_string(&rule.match_request_headers).map_err(InsertOverrideError::Serde)?;
    let mq = serde_json::to_string(&rule.match_query).map_err(InsertOverrideError::Serde)?;
    conn.execute(
        r#"
        INSERT INTO overrides (
            id, name, enabled, match_method, match_host, match_path_regex,
            match_protocol, match_request_headers_json, match_query_json, match_request_body,
            map_remote_protocol, map_remote_host, map_remote_path, map_remote_url,
            status, headers_json, body, stream_interval_ms
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
        "#,
        params![
            &rule.id,
            &String::new(),
            if rule.enabled { 1 } else { 0 },
            Option::<String>::None,
            &rule.match_host,
            &rule.match_path,
            &rule.match_protocol,
            &mrh,
            &mq,
            &rule.match_request_body,
            &rule.map_remote_protocol,
            &rule.map_remote_host,
            &rule.map_remote_path,
            Option::<String>::None,
            rule.status,
            &headers_json,
            &rule.body,
            &rule.stream_interval_ms,
        ],
    )
    .map_err(|e| {
        if e.sqlite_error_code() == Some(ErrorCode::ConstraintViolation) {
            InsertOverrideError::DuplicateId
        } else {
            InsertOverrideError::Sqlite(e)
        }
    })?;
    Ok(())
}

fn update_override_row(path: &StdPath, rule: &OverrideRule) -> anyhow::Result<bool> {
    let conn = Connection::open(path)?;
    let headers_json = serde_json::to_string(&rule.headers)?;
    let mrh = serde_json::to_string(&rule.match_request_headers)?;
    let mq = serde_json::to_string(&rule.match_query)?;
    let changed = conn.execute(
        r#"
        UPDATE overrides
        SET
            name = ?2,
            enabled = ?3,
            match_method = ?4,
            match_host = ?5,
            match_path_regex = ?6,
            match_protocol = ?7,
            match_request_headers_json = ?8,
            match_query_json = ?9,
            match_request_body = ?10,
            map_remote_protocol = ?11,
            map_remote_host = ?12,
            map_remote_path = ?13,
            map_remote_url = ?14,
            status = ?15,
            headers_json = ?16,
            body = ?17,
            stream_interval_ms = ?18
        WHERE id = ?1
        "#,
        params![
            &rule.id,
            &String::new(),
            if rule.enabled { 1 } else { 0 },
            Option::<String>::None,
            &rule.match_host,
            &rule.match_path,
            &rule.match_protocol,
            &mrh,
            &mq,
            &rule.match_request_body,
            &rule.map_remote_protocol,
            &rule.map_remote_host,
            &rule.map_remote_path,
            Option::<String>::None,
            rule.status,
            &headers_json,
            &rule.body,
            &rule.stream_interval_ms,
        ],
    )?;
    Ok(changed > 0)
}

fn delete_override_row(path: &StdPath, id: &str) -> anyhow::Result<bool> {
    let conn = Connection::open(path)?;
    let changed = conn.execute("DELETE FROM overrides WHERE id = ?1", params![id])?;
    Ok(changed > 0)
}

fn override_exists(path: &StdPath, id: &str) -> anyhow::Result<bool> {
    let conn = Connection::open(path)?;
    let n: i64 = conn.query_row(
        "SELECT COUNT(1) FROM overrides WHERE id = ?1",
        params![id],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

pub async fn list_overrides(State(state): State<Arc<AppState>>) -> Json<Vec<OverrideRule>> {
    Json(state.overrides.read().clone())
}

pub async fn create_override(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UpsertOverrideBody>,
) -> Result<Json<OverrideRule>, StatusCode> {
    validate_upsert(&body)?;
    let mut rule = rule_from_body(&body, String::new());
    rule.id = override_id_for_rule(&rule);
    if override_exists(&state.override_db_path, &rule.id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        return Err(StatusCode::CONFLICT);
    }
    insert_override(&state.override_db_path, &rule).map_err(StatusCode::from)?;
    state.overrides.write().insert(0, rule.clone());
    state.notify_overrides_changed();
    Ok(Json(rule))
}

pub async fn update_override(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<UpsertOverrideBody>,
) -> Result<Json<OverrideRule>, StatusCode> {
    validate_upsert(&body)?;
    let mut updated = rule_from_body(&body, id.clone());
    let new_id = override_id_for_rule(&updated);
    updated.id = new_id.clone();
    if new_id == id {
        if !update_override_row(&state.override_db_path, &updated)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        {
            return Err(StatusCode::NOT_FOUND);
        }
    } else {
        if override_exists(&state.override_db_path, &new_id)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        {
            return Err(StatusCode::CONFLICT);
        }
        if !delete_override_row(&state.override_db_path, &id)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        {
            return Err(StatusCode::NOT_FOUND);
        }
        insert_override(&state.override_db_path, &updated).map_err(StatusCode::from)?;
    }
    let mut overrides = state.overrides.write();
    let pos = overrides
        .iter()
        .position(|r| r.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;
    if new_id == id {
        overrides[pos] = updated.clone();
    } else {
        overrides.remove(pos);
        overrides.insert(0, updated.clone());
    }
    drop(overrides);
    state.notify_overrides_changed();
    Ok(Json(updated))
}

pub async fn delete_override(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> StatusCode {
    match delete_override_row(&state.override_db_path, &id) {
        Ok(true) => {
            state.overrides.write().retain(|r| r.id != id);
            state.notify_overrides_changed();
            StatusCode::NO_CONTENT
        }
        Ok(false) => StatusCode::NOT_FOUND,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
