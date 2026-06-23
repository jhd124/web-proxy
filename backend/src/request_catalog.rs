use crate::state::{AppState, TrafficEntry, TrafficKind};
use anyhow::Context;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::path::{Path as StdPath, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

const DEFAULT_MAX_ROUTE_ROWS: i64 = 50_000;
const FLUSH_BATCH_SIZE: usize = 100;
const FLUSH_DELAY: Duration = Duration::from_secs(5);
const MAX_SCHEMA_FIELDS: usize = 80;
const MAX_HEADERS_PER_HOST: usize = 80;
const MAX_HEADER_VALUE_BYTES: usize = 512;
const SETTINGS_PERSIST_SENSITIVE_HEADERS: &str = "persistSensitiveHeaders";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFieldSchema {
    pub key: String,
    pub value_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogBodySchema {
    pub kind: String,
    pub content_type: Option<String>,
    pub fields: Vec<CatalogFieldSchema>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCatalogTemplate {
    pub host: String,
    pub path: String,
    pub method: String,
    pub search_params_schema: Vec<CatalogFieldSchema>,
    pub body_schema: Option<CatalogBodySchema>,
    pub headers: Vec<(String, String)>,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSuggestion {
    pub value: String,
    pub hit_count: i64,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCatalogSettings {
    pub persist_sensitive_headers: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefixSuggestQuery {
    #[serde(default)]
    pub prefix: String,
    #[serde(default = "default_suggestion_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathSuggestQuery {
    pub host: String,
    #[serde(default)]
    pub prefix: String,
    #[serde(default = "default_suggestion_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodSuggestQuery {
    pub host: String,
    pub path: String,
    #[serde(default = "default_suggestion_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateQuery {
    pub host: String,
    pub path: String,
    pub method: String,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct CatalogKey {
    method: String,
    host: String,
    path: String,
}

#[derive(Clone, Debug)]
struct PendingTemplate {
    key: CatalogKey,
    hit_count: i64,
    first_seen_at: DateTime<Utc>,
    last_seen_at: DateTime<Utc>,
    search_params_schema: Vec<CatalogFieldSchema>,
    body_schema: Option<CatalogBodySchema>,
    content_type: Option<String>,
    headers: Vec<(String, String)>,
}

pub struct RequestCatalogRecorder {
    db_path: PathBuf,
    pending: Mutex<HashMap<CatalogKey, PendingTemplate>>,
    flush_scheduled: AtomicBool,
}

impl RequestCatalogRecorder {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            pending: Mutex::new(HashMap::new()),
            flush_scheduled: AtomicBool::new(false),
        }
    }

    pub fn record_traffic_candidate(self: &Arc<Self>, entry: &TrafficEntry) {
        let Some(template) = build_pending_template(&self.db_path, entry) else {
            return;
        };
        let should_flush_now = {
            let mut pending = self.pending.lock();
            pending
                .entry(template.key.clone())
                .and_modify(|existing| {
                    existing.hit_count += template.hit_count;
                    existing.last_seen_at = template.last_seen_at;
                    existing.search_params_schema = template.search_params_schema.clone();
                    existing.body_schema = template.body_schema.clone();
                    existing.content_type = template.content_type.clone();
                    if !template.headers.is_empty() {
                        existing.headers = template.headers.clone();
                    }
                })
                .or_insert(template);
            pending.len() >= FLUSH_BATCH_SIZE
        };

        if should_flush_now {
            self.spawn_flush(Duration::from_millis(0));
        } else {
            self.spawn_flush(FLUSH_DELAY);
        }
    }

    pub fn flush_pending(&self) -> anyhow::Result<()> {
        let templates = {
            let mut pending = self.pending.lock();
            if pending.is_empty() {
                self.flush_scheduled.store(false, Ordering::Relaxed);
                return Ok(());
            }
            pending.drain().map(|(_, value)| value).collect::<Vec<_>>()
        };
        flush_templates(&self.db_path, &templates)?;
        self.flush_scheduled.store(false, Ordering::Relaxed);
        Ok(())
    }

    fn spawn_flush(self: &Arc<Self>, delay: Duration) {
        if self.flush_scheduled.swap(true, Ordering::Relaxed) {
            return;
        }
        let recorder = Arc::clone(self);
        if tokio::runtime::Handle::try_current().is_err() {
            return;
        }
        tokio::spawn(async move {
            if !delay.is_zero() {
                tokio::time::sleep(delay).await;
            }
            if let Err(error) = tokio::task::spawn_blocking(move || recorder.flush_pending()).await
            {
                tracing::warn!("request catalog flush task failed: {}", error);
            }
        });
    }
}

pub fn init(path: &StdPath) -> anyhow::Result<()> {
    let conn = Connection::open(path).with_context(|| format!("open sqlite {}", path.display()))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS request_catalog_routes (
            method TEXT NOT NULL,
            host TEXT NOT NULL,
            path TEXT NOT NULL,
            hit_count INTEGER NOT NULL DEFAULT 1,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            search_params_schema_json TEXT NOT NULL DEFAULT '[]',
            body_schema_json TEXT,
            content_type TEXT,
            PRIMARY KEY (method, host, path)
        );
        CREATE INDEX IF NOT EXISTS idx_request_catalog_routes_host
            ON request_catalog_routes(host, hit_count DESC, last_seen_at DESC);
        CREATE INDEX IF NOT EXISTS idx_request_catalog_routes_path
            ON request_catalog_routes(host, path, hit_count DESC, last_seen_at DESC);
        CREATE INDEX IF NOT EXISTS idx_request_catalog_routes_last_seen
            ON request_catalog_routes(last_seen_at);

        CREATE TABLE IF NOT EXISTS request_catalog_host_headers (
            host TEXT PRIMARY KEY NOT NULL,
            headers_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS request_catalog_settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );
        "#,
    )
    .context("create request catalog tables")?;
    conn.execute(
        r#"
        INSERT OR IGNORE INTO request_catalog_settings (key, value)
        VALUES (?1, 'false')
        "#,
        params![SETTINGS_PERSIST_SENSITIVE_HEADERS],
    )?;
    Ok(())
}

pub async fn suggest_hosts(
    Query(query): Query<PrefixSuggestQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<CatalogSuggestion>>, StatusCode> {
    flush_catalog(&state)?;
    suggest_distinct(
        &state.override_db_path,
        "host",
        None,
        &query.prefix,
        query.limit,
    )
    .map(Json)
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn suggest_paths(
    Query(query): Query<PathSuggestQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<CatalogSuggestion>>, StatusCode> {
    flush_catalog(&state)?;
    let host = normalize_host(&query.host);
    suggest_distinct(
        &state.override_db_path,
        "path",
        Some(("host", host.as_str())),
        &query.prefix,
        query.limit,
    )
    .map(Json)
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn suggest_methods(
    Query(query): Query<MethodSuggestQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<CatalogSuggestion>>, StatusCode> {
    flush_catalog(&state)?;
    let host = normalize_host(&query.host);
    let path = normalize_path(&query.path);
    suggest_methods_for_route(&state.override_db_path, &host, &path, query.limit)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_template(
    Query(query): Query<TemplateQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<RequestCatalogTemplate>, StatusCode> {
    flush_catalog(&state)?;
    let host = normalize_host(&query.host);
    let path = normalize_path(&query.path);
    let method = normalize_method(&query.method);
    load_template(&state.override_db_path, &host, &path, &method)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn get_settings(
    State(state): State<Arc<AppState>>,
) -> Result<Json<RequestCatalogSettings>, StatusCode> {
    load_settings(&state.override_db_path)
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn put_settings(
    State(state): State<Arc<AppState>>,
    Json(settings): Json<RequestCatalogSettings>,
) -> Result<Json<RequestCatalogSettings>, StatusCode> {
    save_settings(&state.override_db_path, &settings)
        .map(|_| Json(settings))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn flush_catalog(state: &Arc<AppState>) -> Result<(), StatusCode> {
    state
        .request_catalog
        .flush_pending()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn flush_templates(path: &StdPath, templates: &[PendingTemplate]) -> anyhow::Result<()> {
    if templates.is_empty() {
        return Ok(());
    }
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    for template in templates {
        let search_params_schema_json = serde_json::to_string(&template.search_params_schema)?;
        let body_schema_json = template
            .body_schema
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        tx.execute(
            r#"
            INSERT INTO request_catalog_routes (
                method, host, path, hit_count, first_seen_at, last_seen_at,
                search_params_schema_json, body_schema_json, content_type
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(method, host, path) DO UPDATE SET
                hit_count = request_catalog_routes.hit_count + excluded.hit_count,
                last_seen_at = excluded.last_seen_at,
                search_params_schema_json = excluded.search_params_schema_json,
                body_schema_json = excluded.body_schema_json,
                content_type = excluded.content_type
            "#,
            params![
                template.key.method,
                template.key.host,
                template.key.path,
                template.hit_count,
                template.first_seen_at.to_rfc3339(),
                template.last_seen_at.to_rfc3339(),
                search_params_schema_json,
                body_schema_json,
                template.content_type,
            ],
        )?;
        if !template.headers.is_empty() {
            tx.execute(
                r#"
                INSERT INTO request_catalog_host_headers (host, headers_json, updated_at)
                VALUES (?1, ?2, ?3)
                ON CONFLICT(host) DO UPDATE SET
                    headers_json = excluded.headers_json,
                    updated_at = excluded.updated_at
                "#,
                params![
                    template.key.host,
                    serde_json::to_string(&template.headers)?,
                    template.last_seen_at.to_rfc3339(),
                ],
            )?;
        }
    }
    prune_routes(&tx, DEFAULT_MAX_ROUTE_ROWS)?;
    tx.commit()?;
    Ok(())
}

fn prune_routes(conn: &Connection, max_rows: i64) -> anyhow::Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM request_catalog_routes", [], |row| {
        row.get(0)
    })?;
    let excess = count - max_rows;
    if excess <= 0 {
        return Ok(());
    }
    conn.execute(
        r#"
        DELETE FROM request_catalog_routes
        WHERE rowid IN (
            SELECT rowid FROM request_catalog_routes
            ORDER BY last_seen_at ASC
            LIMIT ?1
        )
        "#,
        params![excess],
    )?;
    Ok(())
}

fn suggest_distinct(
    path: &StdPath,
    column: &str,
    exact_filter: Option<(&str, &str)>,
    prefix: &str,
    limit: usize,
) -> anyhow::Result<Vec<CatalogSuggestion>> {
    let conn = Connection::open(path)?;
    let limit = normalize_limit(limit);
    let prefix = format!("{}%", prefix.trim().to_ascii_lowercase());
    let sql = match (column, exact_filter.map(|(filter_column, _)| filter_column)) {
        ("host", None) => {
            r#"
            SELECT host, SUM(hit_count) AS hits, MAX(last_seen_at) AS seen
            FROM request_catalog_routes
            WHERE host LIKE ?1
            GROUP BY host
            ORDER BY hits DESC, seen DESC
            LIMIT ?2
            "#
        }
        ("path", Some("host")) => {
            r#"
            SELECT path, SUM(hit_count) AS hits, MAX(last_seen_at) AS seen
            FROM request_catalog_routes
            WHERE host = ?3 AND path LIKE ?1
            GROUP BY path
            ORDER BY hits DESC, seen DESC
            LIMIT ?2
            "#
        }
        _ => anyhow::bail!("unsupported suggestion query"),
    };
    let mut stmt = conn.prepare(sql)?;
    let mut rows = if let Some((_, filter_value)) = exact_filter {
        stmt.query(params![prefix, limit as i64, filter_value])?
    } else {
        stmt.query(params![prefix, limit as i64])?
    };
    let mut suggestions = Vec::new();
    while let Some(row) = rows.next()? {
        suggestions.push(CatalogSuggestion {
            value: row.get(0)?,
            hit_count: row.get(1)?,
            last_seen_at: parse_rfc3339(row.get::<_, String>(2)?)?,
        });
    }
    Ok(suggestions)
}

fn suggest_methods_for_route(
    path: &StdPath,
    host: &str,
    route_path: &str,
    limit: usize,
) -> anyhow::Result<Vec<CatalogSuggestion>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        r#"
        SELECT method, hit_count, last_seen_at
        FROM request_catalog_routes
        WHERE host = ?1 AND path = ?2
        ORDER BY hit_count DESC, last_seen_at DESC
        LIMIT ?3
        "#,
    )?;
    let rows = stmt.query_map(
        params![host, route_path, normalize_limit(limit) as i64],
        |row| {
            Ok(CatalogSuggestion {
                value: row.get(0)?,
                hit_count: row.get(1)?,
                last_seen_at: parse_rfc3339(row.get::<_, String>(2)?)
                    .map_err(|_| rusqlite::Error::InvalidQuery)?,
            })
        },
    )?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn load_template(
    db_path: &StdPath,
    host: &str,
    route_path: &str,
    method: &str,
) -> anyhow::Result<Option<RequestCatalogTemplate>> {
    let conn = Connection::open(db_path)?;
    let row = conn
        .query_row(
            r#"
            SELECT search_params_schema_json, body_schema_json, last_seen_at
            FROM request_catalog_routes
            WHERE host = ?1 AND path = ?2 AND method = ?3
            "#,
            params![host, route_path, method],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;
    let Some((search_params_schema_json, body_schema_json, last_seen_at)) = row else {
        return Ok(None);
    };
    let headers_json = conn
        .query_row(
            "SELECT headers_json FROM request_catalog_host_headers WHERE host = ?1",
            params![host],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .unwrap_or_else(|| "[]".to_string());
    Ok(Some(RequestCatalogTemplate {
        host: host.to_string(),
        path: route_path.to_string(),
        method: method.to_string(),
        search_params_schema: serde_json::from_str(&search_params_schema_json)?,
        body_schema: body_schema_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?,
        headers: serde_json::from_str(&headers_json)?,
        last_seen_at: parse_rfc3339(last_seen_at)?,
    }))
}

pub(crate) fn load_settings(path: &StdPath) -> anyhow::Result<RequestCatalogSettings> {
    let conn = Connection::open(path)?;
    let raw = conn
        .query_row(
            "SELECT value FROM request_catalog_settings WHERE key = ?1",
            params![SETTINGS_PERSIST_SENSITIVE_HEADERS],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .unwrap_or_else(|| "false".to_string());
    Ok(RequestCatalogSettings {
        persist_sensitive_headers: raw == "true",
    })
}

fn save_settings(path: &StdPath, settings: &RequestCatalogSettings) -> anyhow::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        r#"
        INSERT INTO request_catalog_settings (key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        "#,
        params![
            SETTINGS_PERSIST_SENSITIVE_HEADERS,
            if settings.persist_sensitive_headers {
                "true"
            } else {
                "false"
            }
        ],
    )?;
    Ok(())
}

fn build_pending_template(path: &StdPath, entry: &TrafficEntry) -> Option<PendingTemplate> {
    if !is_api_catalog_candidate(entry) {
        return None;
    }
    let settings = load_settings(path).unwrap_or(RequestCatalogSettings {
        persist_sensitive_headers: false,
    });
    let host = normalize_host(&entry.host);
    if host.is_empty() {
        return None;
    }
    let request_content_type = header_value(&entry.request_headers, "content-type");
    let response_content_type = entry
        .response_headers
        .as_deref()
        .and_then(|headers| header_value(headers, "content-type"));
    let content_type = request_content_type
        .clone()
        .or_else(|| response_content_type.clone());
    Some(PendingTemplate {
        key: CatalogKey {
            method: normalize_method(&entry.method),
            host,
            path: normalize_path(&entry.path),
        },
        hit_count: 1,
        first_seen_at: entry.at,
        last_seen_at: Utc::now(),
        search_params_schema: extract_search_params_schema(&entry.url),
        body_schema: extract_body_schema(
            entry.request_body_preview.as_deref(),
            request_content_type.as_deref(),
        ),
        content_type,
        headers: sanitize_headers(&entry.request_headers, settings.persist_sensitive_headers),
    })
}

fn is_api_catalog_candidate(entry: &TrafficEntry) -> bool {
    if !matches!(entry.kind, TrafficKind::Http) {
        return false;
    }
    if entry.pending || entry.error.is_some() || entry.host.trim().is_empty() {
        return false;
    }
    if is_static_resource_path(&entry.path) {
        return false;
    }
    if let Some(dest) = header_value(&entry.request_headers, "sec-fetch-dest") {
        let dest = dest.trim().to_ascii_lowercase();
        if !dest.is_empty() && dest != "empty" {
            return false;
        }
    }
    let request_content_type = header_value(&entry.request_headers, "content-type")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let response_content_type = entry
        .response_headers
        .as_deref()
        .and_then(|headers| header_value(headers, "content-type"))
        .unwrap_or_default()
        .to_ascii_lowercase();
    if is_api_content_type(&request_content_type) || is_api_content_type(&response_content_type) {
        return true;
    }
    if is_resource_content_type(&response_content_type) {
        return false;
    }
    let accept = header_value(&entry.request_headers, "accept")
        .unwrap_or_default()
        .to_ascii_lowercase();
    if accept.contains("text/html") && !looks_like_api_path(&entry.path) {
        return false;
    }
    entry.method.eq_ignore_ascii_case("POST")
        || entry.method.eq_ignore_ascii_case("PUT")
        || entry.method.eq_ignore_ascii_case("PATCH")
        || entry.method.eq_ignore_ascii_case("DELETE")
        || looks_like_api_path(&entry.path)
}

fn extract_search_params_schema(url: &str) -> Vec<CatalogFieldSchema> {
    let Ok(parsed) = url::Url::parse(url) else {
        return Vec::new();
    };
    let mut fields = BTreeMap::<String, String>::new();
    for (key, value) in parsed.query_pairs() {
        fields
            .entry(key.into_owned())
            .or_insert_with(|| infer_value_type(&value));
        if fields.len() >= MAX_SCHEMA_FIELDS {
            break;
        }
    }
    fields
        .into_iter()
        .map(|(key, value_type)| CatalogFieldSchema { key, value_type })
        .collect()
}

fn extract_body_schema(
    body: Option<&str>,
    content_type: Option<&str>,
) -> Option<CatalogBodySchema> {
    let content_type = content_type.map(str::to_string);
    let body = body?.trim();
    if body.is_empty() {
        return None;
    }
    let lower_content_type = content_type
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if lower_content_type.contains("application/json")
        || lower_content_type.contains("+json")
        || body.starts_with('{')
        || body.starts_with('[')
    {
        let fields = serde_json::from_str::<Value>(body)
            .ok()
            .map(json_fields)
            .unwrap_or_default();
        return Some(CatalogBodySchema {
            kind: "json".to_string(),
            content_type,
            fields,
        });
    }
    if lower_content_type.contains("application/x-www-form-urlencoded") {
        let fields = url::form_urlencoded::parse(body.as_bytes())
            .take(MAX_SCHEMA_FIELDS)
            .map(|(key, value)| CatalogFieldSchema {
                key: key.into_owned(),
                value_type: infer_value_type(&value),
            })
            .collect();
        return Some(CatalogBodySchema {
            kind: "form".to_string(),
            content_type,
            fields,
        });
    }
    Some(CatalogBodySchema {
        kind: "raw".to_string(),
        content_type,
        fields: Vec::new(),
    })
}

fn json_fields(value: Value) -> Vec<CatalogFieldSchema> {
    let mut fields = Vec::new();
    match value {
        Value::Object(map) => {
            for (key, value) in map.into_iter().take(MAX_SCHEMA_FIELDS) {
                fields.push(CatalogFieldSchema {
                    key,
                    value_type: json_value_type(&value).to_string(),
                });
            }
        }
        Value::Array(items) => {
            if let Some(Value::Object(map)) = items.into_iter().next() {
                for (key, value) in map.into_iter().take(MAX_SCHEMA_FIELDS) {
                    fields.push(CatalogFieldSchema {
                        key,
                        value_type: json_value_type(&value).to_string(),
                    });
                }
            }
        }
        _ => {}
    }
    fields
}

fn sanitize_headers(
    headers: &[(String, String)],
    persist_sensitive_headers: bool,
) -> Vec<(String, String)> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            let normalized_name = name.trim().to_ascii_lowercase();
            if normalized_name.is_empty() {
                return None;
            }
            if !persist_sensitive_headers && is_sensitive_header(&normalized_name) {
                return None;
            }
            let mut value = value.trim().to_string();
            if value.len() > MAX_HEADER_VALUE_BYTES {
                value.truncate(MAX_HEADER_VALUE_BYTES);
            }
            Some((normalized_name, value))
        })
        .take(MAX_HEADERS_PER_HOST)
        .collect()
}

fn header_value(headers: &[(String, String)], target: &str) -> Option<String> {
    headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(target))
        .map(|(_, value)| value.clone())
}

pub(crate) fn is_sensitive_header(name: &str) -> bool {
    matches!(
        name,
        "authorization" | "cookie" | "proxy-authorization" | "set-cookie" | "x-api-key"
    )
}

fn is_api_content_type(value: &str) -> bool {
    value.contains("application/json")
        || value.contains("+json")
        || value.contains("application/graphql")
        || value.contains("application/x-www-form-urlencoded")
        || value.contains("multipart/form-data")
}

fn is_resource_content_type(value: &str) -> bool {
    value.contains("text/html")
        || value.contains("javascript")
        || value.contains("text/css")
        || value.starts_with("image/")
        || value.starts_with("video/")
        || value.starts_with("audio/")
        || value.starts_with("font/")
        || value.contains("font")
}

fn is_static_resource_path(path: &str) -> bool {
    let path_without_query = path.split(['?', '#']).next().unwrap_or_default();
    let last_segment = path_without_query.rsplit('/').next().unwrap_or_default();
    let Some((_, extension)) = last_segment.rsplit_once('.') else {
        return false;
    };
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "html"
            | "htm"
            | "js"
            | "mjs"
            | "cjs"
            | "jsx"
            | "ts"
            | "tsx"
            | "css"
            | "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "svg"
            | "ico"
            | "bmp"
            | "avif"
            | "mp4"
            | "webm"
            | "ogg"
            | "mov"
            | "avi"
            | "mkv"
            | "mp3"
            | "wav"
            | "flac"
            | "m4a"
            | "woff"
            | "woff2"
            | "ttf"
            | "otf"
            | "eot"
            | "wasm"
            | "map"
            | "manifest"
    )
}

fn looks_like_api_path(path: &str) -> bool {
    let value = path.to_ascii_lowercase();
    value == "/graphql"
        || value.contains("/api/")
        || value.starts_with("/api")
        || value.contains("/rpc/")
        || value.starts_with("/rpc")
        || value.contains("/v1/")
        || value.contains("/v2/")
        || value.contains("/v3/")
}

fn normalize_host(host: &str) -> String {
    host.trim().to_ascii_lowercase()
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

fn normalize_method(method: &str) -> String {
    method.trim().to_ascii_uppercase()
}

fn normalize_limit(limit: usize) -> usize {
    limit.clamp(1, 50)
}

fn default_suggestion_limit() -> usize {
    20
}

fn parse_rfc3339(value: String) -> anyhow::Result<DateTime<Utc>> {
    Ok(DateTime::parse_from_rfc3339(&value)?.with_timezone(&Utc))
}

fn infer_value_type(value: &str) -> String {
    if value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("false") {
        return "boolean".to_string();
    }
    if value.parse::<f64>().is_ok() {
        return "number".to_string();
    }
    "string".to_string()
}

fn json_value_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}
