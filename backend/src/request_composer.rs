use crate::request_catalog;
use crate::state::{AppState, TrafficEntry, TrafficKind};
use anyhow::Context;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path as StdPath;
use std::sync::Arc;
use std::time::Instant;
use uuid::Uuid;

const RESPONSE_BODY_PREVIEW_MAX: usize = 64 * 1024;
const REQUEST_BODY_PREVIEW_MAX: usize = 64 * 1024;
const DEFAULT_HISTORY_LIMIT: usize = 40;
const MAX_HISTORY_LIMIT: usize = 100;
const MAX_HISTORY_ROWS: i64 = 2_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestComposerRequest {
    pub scheme: String,
    pub host: String,
    pub path: String,
    #[serde(default)]
    pub method: String,
    #[serde(default)]
    pub search_params: Vec<(String, String)>,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestComposerResponse {
    pub status: Option<u16>,
    pub headers: Vec<(String, String)>,
    pub body_preview: Option<String>,
    pub duration_ms: u64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestComposerSendResponse {
    pub history_id: Uuid,
    pub response: RequestComposerResponse,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestComposerHistoryItem {
    pub id: Uuid,
    pub sent_at: DateTime<Utc>,
    pub method: String,
    pub url: String,
    pub host: String,
    pub path: String,
    pub response_status: Option<u16>,
    pub duration_ms: u64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestComposerHistoryDetail {
    pub id: Uuid,
    pub sent_at: DateTime<Utc>,
    pub request: RequestComposerRequest,
    pub url: String,
    pub response: RequestComposerResponse,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryQuery {
    #[serde(default = "default_history_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
    #[serde(default)]
    pub q: String,
}

pub fn init(path: &StdPath) -> anyhow::Result<()> {
    let conn = Connection::open(path).with_context(|| format!("open sqlite {}", path.display()))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS request_composer_history (
            id TEXT PRIMARY KEY NOT NULL,
            sent_at TEXT NOT NULL,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            host TEXT NOT NULL,
            path TEXT NOT NULL,
            response_status INTEGER,
            duration_ms INTEGER NOT NULL,
            error TEXT,
            request_json TEXT NOT NULL,
            response_json TEXT NOT NULL,
            search_text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_request_composer_history_sent_at
            ON request_composer_history(sent_at DESC);
        CREATE INDEX IF NOT EXISTS idx_request_composer_history_search
            ON request_composer_history(search_text);
        "#,
    )
    .context("create request composer history table")?;
    Ok(())
}

pub async fn send_request(
    State(state): State<Arc<AppState>>,
    Json(request): Json<RequestComposerRequest>,
) -> Result<Json<RequestComposerSendResponse>, StatusCode> {
    let normalized_request = normalize_request(request).map_err(|_| StatusCode::BAD_REQUEST)?;
    let url = build_url(&normalized_request).map_err(|_| StatusCode::BAD_REQUEST)?;
    let history_id = Uuid::new_v4();
    let started = Instant::now();
    let result = send_upstream(&state, &normalized_request, &url).await;
    let duration_ms = started.elapsed().as_millis() as u64;
    let response = match result {
        Ok(mut response) => {
            response.duration_ms = duration_ms;
            response
        }
        Err(error) => RequestComposerResponse {
            status: None,
            headers: Vec::new(),
            body_preview: None,
            duration_ms,
            error: Some(error.to_string()),
        },
    };
    let sent_at = Utc::now();
    let history_request = sanitize_history_request(&state, &normalized_request);
    save_history(
        &state.override_db_path,
        history_id,
        sent_at,
        &history_request,
        &url,
        &response,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    prune_history(&state.override_db_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let traffic_entry =
        build_traffic_entry(history_id, sent_at, &normalized_request, &url, &response);
    state.push_traffic(traffic_entry.clone());
    state
        .request_catalog
        .record_traffic_candidate(&traffic_entry);

    Ok(Json(RequestComposerSendResponse {
        history_id,
        response,
    }))
}

pub async fn list_history(
    Query(query): Query<HistoryQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<RequestComposerHistoryItem>>, StatusCode> {
    load_history_list(&state.override_db_path, &query)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn history_detail(
    Path(id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<RequestComposerHistoryDetail>, StatusCode> {
    load_history_detail(&state.override_db_path, id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn delete_history(
    Path(id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
) -> StatusCode {
    match delete_history_row(&state.override_db_path, id) {
        Ok(true) => StatusCode::NO_CONTENT,
        Ok(false) => StatusCode::NOT_FOUND,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

pub async fn clear_history(State(state): State<Arc<AppState>>) -> StatusCode {
    match clear_history_rows(&state.override_db_path) {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn send_upstream(
    state: &Arc<AppState>,
    request: &RequestComposerRequest,
    url: &str,
) -> anyhow::Result<RequestComposerResponse> {
    let method = request.method.parse::<reqwest::Method>()?;
    let mut builder = state
        .upstream_http_client
        .request(method, url)
        .headers(build_header_map(&request.headers));
    if let Some(body) = request.body.as_ref() {
        if !body.is_empty() {
            builder = builder.body(body.clone());
        }
    }
    let response = builder.send().await?;
    let status = response.status().as_u16();
    let headers = response_headers(response.headers());
    let body_preview = read_response_preview(response).await?;
    Ok(RequestComposerResponse {
        status: Some(status),
        headers,
        body_preview,
        duration_ms: 0,
        error: None,
    })
}

async fn read_response_preview(response: reqwest::Response) -> anyhow::Result<Option<String>> {
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let remaining = RESPONSE_BODY_PREVIEW_MAX.saturating_sub(bytes.len());
        if remaining == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
        if bytes.len() >= RESPONSE_BODY_PREVIEW_MAX {
            break;
        }
    }
    if bytes.is_empty() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&bytes).to_string()))
}

fn build_header_map(headers: &[(String, String)]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for (name, value) in headers {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(name.trim().as_bytes()),
            HeaderValue::from_str(value),
        ) {
            map.append(name, value);
        }
    }
    map
}

fn response_headers(headers: &HeaderMap) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|(name, value)| {
            (
                name.to_string(),
                value.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect()
}

fn normalize_request(
    mut request: RequestComposerRequest,
) -> anyhow::Result<RequestComposerRequest> {
    request.scheme = request.scheme.trim().to_ascii_lowercase();
    if request.scheme != "http" && request.scheme != "https" {
        anyhow::bail!("unsupported scheme");
    }
    request.host = request.host.trim().to_ascii_lowercase();
    if request.host.is_empty() {
        anyhow::bail!("host is required");
    }
    request.path = normalize_path(&request.path);
    request.method = if request.method.trim().is_empty() {
        "GET".to_string()
    } else {
        request.method.trim().to_ascii_uppercase()
    };
    Ok(request)
}

fn build_url(request: &RequestComposerRequest) -> anyhow::Result<String> {
    let mut url = url::Url::parse(&format!("{}://{}", request.scheme, request.host))?;
    url.set_path(&request.path);
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in &request.search_params {
            if !key.trim().is_empty() {
                query.append_pair(key, value);
            }
        }
    }
    Ok(url.to_string())
}

fn sanitize_history_request(
    state: &Arc<AppState>,
    request: &RequestComposerRequest,
) -> RequestComposerRequest {
    let settings = request_catalog::load_settings(&state.override_db_path).unwrap_or(
        request_catalog::RequestCatalogSettings {
            persist_sensitive_headers: false,
        },
    );
    if settings.persist_sensitive_headers {
        return request.clone();
    }
    let mut sanitized = request.clone();
    sanitized.headers = sanitized
        .headers
        .into_iter()
        .filter(|(name, _)| !request_catalog::is_sensitive_header(&name.to_ascii_lowercase()))
        .collect();
    sanitized
}

fn save_history(
    path: &StdPath,
    id: Uuid,
    sent_at: DateTime<Utc>,
    request: &RequestComposerRequest,
    url: &str,
    response: &RequestComposerResponse,
) -> anyhow::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        r#"
        INSERT INTO request_composer_history (
            id, sent_at, method, url, host, path, response_status, duration_ms,
            error, request_json, response_json, search_text
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
        params![
            id.to_string(),
            sent_at.to_rfc3339(),
            request.method.as_str(),
            url,
            request.host.as_str(),
            request.path.as_str(),
            response.status.map(i64::from),
            response.duration_ms as i64,
            response.error.as_deref(),
            serde_json::to_string(request)?,
            serde_json::to_string(response)?,
            history_search_text(request, url, response),
        ],
    )?;
    Ok(())
}

fn prune_history(path: &StdPath) -> anyhow::Result<()> {
    let conn = Connection::open(path)?;
    let count: i64 =
        conn.query_row("SELECT COUNT(*) FROM request_composer_history", [], |row| {
            row.get(0)
        })?;
    let excess = count - MAX_HISTORY_ROWS;
    if excess <= 0 {
        return Ok(());
    }
    conn.execute(
        r#"
        DELETE FROM request_composer_history
        WHERE rowid IN (
            SELECT rowid FROM request_composer_history
            ORDER BY sent_at ASC
            LIMIT ?1
        )
        "#,
        params![excess],
    )?;
    Ok(())
}

fn load_history_list(
    path: &StdPath,
    query: &HistoryQuery,
) -> anyhow::Result<Vec<RequestComposerHistoryItem>> {
    let conn = Connection::open(path)?;
    let limit = query.limit.clamp(1, MAX_HISTORY_LIMIT) as i64;
    let offset = query.offset as i64;
    let keyword = query.q.trim().to_ascii_lowercase();
    let mut items = Vec::new();
    if keyword.is_empty() {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, sent_at, method, url, host, path, response_status, duration_ms, error
            FROM request_composer_history
            ORDER BY sent_at DESC
            LIMIT ?1 OFFSET ?2
            "#,
        )?;
        let rows = stmt.query_map(params![limit, offset], history_item_from_row)?;
        for row in rows {
            items.push(row?);
        }
        return Ok(items);
    }
    let like = format!("%{keyword}%");
    let mut stmt = conn.prepare(
        r#"
        SELECT id, sent_at, method, url, host, path, response_status, duration_ms, error
        FROM request_composer_history
        WHERE search_text LIKE ?1
        ORDER BY sent_at DESC
        LIMIT ?2 OFFSET ?3
        "#,
    )?;
    let rows = stmt.query_map(params![like, limit, offset], history_item_from_row)?;
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

fn load_history_detail(
    path: &StdPath,
    id: Uuid,
) -> anyhow::Result<Option<RequestComposerHistoryDetail>> {
    let conn = Connection::open(path)?;
    conn.query_row(
        r#"
        SELECT sent_at, request_json, url, response_json
        FROM request_composer_history
        WHERE id = ?1
        "#,
        params![id.to_string()],
        |row| {
            let sent_at: String = row.get(0)?;
            let request_json: String = row.get(1)?;
            let url: String = row.get(2)?;
            let response_json: String = row.get(3)?;
            Ok((sent_at, request_json, url, response_json))
        },
    )
    .optional()?
    .map(|(sent_at, request_json, url, response_json)| {
        Ok(RequestComposerHistoryDetail {
            id,
            sent_at: parse_rfc3339(sent_at)?,
            request: serde_json::from_str(&request_json)?,
            url,
            response: serde_json::from_str(&response_json)?,
        })
    })
    .transpose()
}

fn delete_history_row(path: &StdPath, id: Uuid) -> anyhow::Result<bool> {
    let conn = Connection::open(path)?;
    let changed = conn.execute(
        "DELETE FROM request_composer_history WHERE id = ?1",
        params![id.to_string()],
    )?;
    Ok(changed > 0)
}

fn clear_history_rows(path: &StdPath) -> anyhow::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute("DELETE FROM request_composer_history", [])?;
    Ok(())
}

fn history_item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RequestComposerHistoryItem> {
    let id: String = row.get(0)?;
    let sent_at: String = row.get(1)?;
    let response_status: Option<i64> = row.get(6)?;
    Ok(RequestComposerHistoryItem {
        id: Uuid::parse_str(&id).map_err(|_| rusqlite::Error::InvalidQuery)?,
        sent_at: parse_rfc3339(sent_at).map_err(|_| rusqlite::Error::InvalidQuery)?,
        method: row.get(2)?,
        url: row.get(3)?,
        host: row.get(4)?,
        path: row.get(5)?,
        response_status: response_status.map(|status| status as u16),
        duration_ms: row.get::<_, i64>(7)? as u64,
        error: row.get(8)?,
    })
}

fn build_traffic_entry(
    id: Uuid,
    at: DateTime<Utc>,
    request: &RequestComposerRequest,
    url: &str,
    response: &RequestComposerResponse,
) -> TrafficEntry {
    TrafficEntry {
        id,
        at,
        peer: "request-composer".to_string(),
        app_name: Some("Request Composer".to_string()),
        method: request.method.clone(),
        url: url.to_string(),
        scheme: request.scheme.clone(),
        host: request.host.clone(),
        path: request.path.clone(),
        request_headers: request.headers.clone(),
        request_body_preview: request.body.as_deref().map(truncate_request_body),
        kind: TrafficKind::Http,
        mitm_bypassed: false,
        response_status: response.status,
        response_headers: Some(response.headers.clone()),
        response_body_preview: response.body_preview.clone(),
        duration_ms: Some(response.duration_ms),
        error: response.error.clone(),
        pending: false,
        breakpoint_name: None,
        override_match_id: None,
        breakpoint_match_id: None,
        stream_controllable: false,
        stream_playing: None,
    }
}

fn truncate_request_body(body: &str) -> String {
    if body.len() <= REQUEST_BODY_PREVIEW_MAX {
        return body.to_string();
    }
    body.chars().take(REQUEST_BODY_PREVIEW_MAX).collect()
}

fn history_search_text(
    request: &RequestComposerRequest,
    url: &str,
    response: &RequestComposerResponse,
) -> String {
    let status = response
        .status
        .map(|status| status.to_string())
        .unwrap_or_default();
    [
        request.method.as_str(),
        request.host.as_str(),
        request.path.as_str(),
        url,
        status.as_str(),
        response.error.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_ascii_lowercase()
}

fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return "/".to_string();
    }
    if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn parse_rfc3339(value: String) -> anyhow::Result<DateTime<Utc>> {
    Ok(DateTime::parse_from_rfc3339(&value)?.with_timezone(&Utc))
}

fn default_history_limit() -> usize {
    DEFAULT_HISTORY_LIMIT
}
