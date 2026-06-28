use chrono::{DateTime, Utc};
use http::header::HeaderMap;
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, oneshot, watch};
use uuid::Uuid;

const FILTER_DOT_VARIANTS: [char; 2] = ['．', '。'];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverrideRule {
    /// SHA-256 hex (64 chars) from match identity, or an older id string from pre-hash DB rows.
    pub id: String,
    pub enabled: bool,
    /// e.g. `GET` / `POST`; empty means match any method.
    pub match_method: Option<String>,
    /// e.g. `http` / `https`
    pub match_protocol: Option<String>,
    pub match_host: Option<String>,
    /// Request path (plain), compared after normalization. Serialized as `matchPath`.
    /// Old stored values like `^/foo$` are coerced to `/foo` on load.
    pub match_path: Option<String>,
    /// Headers the **incoming** request must carry (empty = match all). Name is case-insensitive.
    #[serde(default)]
    pub match_request_headers: Vec<(String, String)>,
    /// Query parameters the request must carry (empty = match all).
    #[serde(default)]
    pub match_query: Vec<(String, String)>,
    /// If set and non-empty, request body (UTF-8) must equal this string.
    pub match_request_body: Option<String>,
    pub status: u16,
    /// Response headers to send with the override.
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub map_remote_protocol: Option<String>,
    pub map_remote_host: Option<String>,
    pub map_remote_path: Option<String>,
    #[serde(default)]
    pub stream_interval_ms: Option<u64>,
}

impl OverrideRule {
    pub fn matches(
        &self,
        method: &str,
        scheme: &str,
        host: &str,
        _path_with_query: &str,
        path_only: &str,
        request_query: &[(String, String)],
        request_headers: &HeaderMap,
        request_body: &[u8],
    ) -> bool {
        if !self.enabled {
            return false;
        }
        // Host is always required; wildcard patterns (`*`, `?`) are supported.
        let host_want = match self.match_host.as_deref().map(str::trim) {
            Some(t) if !t.is_empty() => t,
            _ => return false,
        };
        if !host_matches(host, host_want) {
            return false;
        }
        if let Some(ref m) = self.match_method {
            let want = m.trim();
            if !want.is_empty() && !want.eq_ignore_ascii_case(method) {
                return false;
            }
        }
        if let Some(ref p) = self.match_protocol {
            if !p.eq_ignore_ascii_case(scheme) {
                return false;
            }
        }
        if let Some(ref want) = self.match_path {
            if !want.trim().is_empty() && !paths_equal(path_only, want) {
                return false;
            }
        }
        if !request_headers_satisfied(request_headers, &self.match_request_headers) {
            return false;
        }
        if !query_satisfied(request_query, &self.match_query) {
            return false;
        }
        if let Some(ref want_body) = self.match_request_body {
            if !want_body.trim().is_empty() {
                let got = String::from_utf8_lossy(request_body);
                if got != *want_body {
                    return false;
                }
            }
        }
        true
    }
}

fn request_headers_satisfied(req: &HeaderMap, rules: &[(String, String)]) -> bool {
    for (rk, rv) in rules {
        let rkl = rk.to_ascii_lowercase();
        let mut any = false;
        for (name, val) in req.iter() {
            if name.as_str().to_ascii_lowercase() == rkl {
                if rv.is_empty() {
                    any = true;
                    break;
                }
                if val.to_str().ok() == Some(rv.as_str()) {
                    any = true;
                    break;
                }
            }
        }
        if !any {
            return false;
        }
    }
    true
}

/// Each rule (k, v) must be satisfied: key present; if v non-empty, one value must equal.
fn query_satisfied(request: &[(String, String)], rules: &[(String, String)]) -> bool {
    for (k, v) in rules {
        let mut any = false;
        for (qk, qv) in request {
            if qk == k {
                if v.is_empty() {
                    any = true;
                    break;
                }
                if qv == v {
                    any = true;
                    break;
                }
            }
        }
        if !any {
            return false;
        }
    }
    true
}

fn normalize_path(p: &str) -> String {
    let t = p.trim();
    if t.is_empty() {
        return "/".to_string();
    }
    if t.starts_with('/') {
        t.to_string()
    } else {
        format!("/{t}")
    }
}

fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p = pattern.as_bytes();
    let t = text.as_bytes();
    let mut p_idx = 0usize;
    let mut t_idx = 0usize;
    let mut star_idx: Option<usize> = None;
    let mut match_idx = 0usize;

    while t_idx < t.len() {
        if p_idx < p.len() && (p[p_idx] == b'?' || p[p_idx] == t[t_idx]) {
            p_idx += 1;
            t_idx += 1;
            continue;
        }
        if p_idx < p.len() && p[p_idx] == b'*' {
            star_idx = Some(p_idx);
            p_idx += 1;
            match_idx = t_idx;
            continue;
        }
        if let Some(star) = star_idx {
            p_idx = star + 1;
            match_idx += 1;
            t_idx = match_idx;
            continue;
        }
        return false;
    }

    while p_idx < p.len() && p[p_idx] == b'*' {
        p_idx += 1;
    }
    p_idx == p.len()
}

fn host_matches(request_host: &str, rule_host: &str) -> bool {
    let request = request_host.to_ascii_lowercase();
    let rule = rule_host.to_ascii_lowercase();
    if rule.contains('*') || rule.contains('?') {
        wildcard_match(&rule, &request)
    } else {
        request == rule
    }
}

fn paths_equal(request_path: &str, rule_path: &str) -> bool {
    let request = normalize_path(request_path);
    let rule = normalize_path(rule_path);
    if rule.contains('*') || rule.contains('?') {
        wildcard_match(&rule, &request)
    } else {
        request == rule
    }
}

/// 从已记录条目的 url 解析 query 键值对（用于规则变更后的命中重算）。
fn query_pairs_from_url(url: &str) -> Vec<(String, String)> {
    url::Url::parse(url)
        .map(|parsed| parsed.query_pairs().into_owned().collect())
        .unwrap_or_default()
}

/// 从条目 url 还原 origin（scheme://host[:port]），与 proxy.rs 的 parse_origin 行为一致。
fn entry_origin(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        let scheme = parsed.scheme();
        let host = parsed.host_str().unwrap_or("");
        match parsed.port() {
            Some(port) => format!("{scheme}://{host}:{port}"),
            None => format!("{scheme}://{host}"),
        }
    } else {
        String::new()
    }
}

/// 把记录的请求头键值对重建为 HeaderMap，供 OverrideRule::matches 复用。
fn header_map_from_pairs(pairs: &[(String, String)]) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in pairs {
        if let (Ok(header_name), Ok(header_value)) = (
            http::header::HeaderName::from_bytes(name.as_bytes()),
            http::header::HeaderValue::from_str(value),
        ) {
            headers.append(header_name, header_value);
        }
    }
    headers
}

fn header_value(pairs: &[(String, String)], target: &str) -> Option<String> {
    pairs
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(target))
        .map(|(_, value)| value.clone())
}

fn is_websocket_entry(entry: &TrafficEntry) -> bool {
    if entry.response_status == Some(101) {
        return true;
    }
    header_value(&entry.request_headers, "upgrade")
        .map(|value| value.to_ascii_lowercase().contains("websocket"))
        .unwrap_or(false)
}

fn normalize_filter_text(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|ch| {
            if FILTER_DOT_VARIANTS.contains(&ch) {
                '.'
            } else {
                ch
            }
        })
        .collect::<String>()
        .to_lowercase()
}

fn percent_decode_url_for_filter(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (
                (bytes[index + 1] as char).to_digit(16),
                (bytes[index + 2] as char).to_digit(16),
            ) {
                decoded.push(((high << 4) + low) as u8);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(decoded).unwrap_or_else(|_| value.to_string())
}

fn url_filter_text(url: &str) -> String {
    let normalized_url = normalize_filter_text(url);
    let decoded_url = normalize_filter_text(&percent_decode_url_for_filter(url));
    if decoded_url == normalized_url {
        normalized_url
    } else {
        format!("{normalized_url} {decoded_url}")
    }
}

fn response_content_type(entry: &TrafficEntry) -> String {
    entry
        .response_headers
        .as_deref()
        .and_then(|headers| header_value(headers, "content-type"))
        .unwrap_or_default()
        .to_lowercase()
}

fn classify_content_type(content_type: &str) -> Option<&'static str> {
    if content_type.is_empty() {
        return None;
    }
    if content_type.contains("text/html") {
        return Some("document");
    }
    if content_type.contains("javascript") || content_type.contains("ecmascript") {
        return Some("js");
    }
    if content_type.contains("text/css") {
        return Some("css");
    }
    if content_type.contains("application/wasm") {
        return Some("wasm");
    }
    if content_type.contains("application/json") || content_type.contains("+json") {
        return Some("json");
    }
    if content_type.starts_with("image/") {
        return Some("image");
    }
    if content_type.starts_with("video/") || content_type.starts_with("audio/") {
        return Some("video");
    }
    if content_type.starts_with("font/") || content_type.contains("font") {
        return Some("font");
    }
    None
}

fn classify_extension(path: &str) -> Option<&'static str> {
    let path_without_query = path.split(['?', '#']).next().unwrap_or_default();
    let last_segment = path_without_query.rsplit('/').next().unwrap_or_default();
    let extension = last_segment.rsplit_once('.')?.1.to_lowercase();
    match extension.as_str() {
        "html" | "htm" => Some("document"),
        "js" | "mjs" | "cjs" | "jsx" | "ts" | "tsx" => Some("js"),
        "css" => Some("css"),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "ico" | "bmp" | "avif" => Some("image"),
        "mp4" | "webm" | "ogg" | "mov" | "avi" | "mkv" | "mp3" | "wav" | "flac" | "m4a" => {
            Some("video")
        }
        "woff" | "woff2" | "ttf" | "otf" | "eot" => Some("font"),
        "wasm" => Some("wasm"),
        "json" => Some("json"),
        _ => None,
    }
}

fn classify_resource_type(entry: &TrafficEntry) -> String {
    classify_content_type(&response_content_type(entry))
        .or_else(|| classify_extension(&entry.path))
        .unwrap_or("other")
        .to_string()
}

fn method_tag(entry: &TrafficEntry) -> String {
    if is_websocket_entry(entry) {
        "WEBSOCKET".to_string()
    } else {
        entry.method.to_uppercase()
    }
}

fn status_class(entry: &TrafficEntry) -> Option<String> {
    let status = entry.response_status?;
    if !(100..600).contains(&status) {
        return None;
    }
    Some(format!("{}xx", status / 100))
}

fn normalize_content_type_label(content_type_value: &str) -> String {
    let media_type = content_type_value
        .to_lowercase()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string();
    if media_type.is_empty() {
        return "—".to_string();
    }
    let subtype_part = media_type
        .split_once('/')
        .map(|(_, subtype)| subtype)
        .unwrap_or(&media_type);
    if subtype_part.is_empty() {
        return media_type;
    }
    let normalized_subtype = subtype_part
        .rsplit_once('+')
        .map(|(_, suffix)| suffix)
        .unwrap_or(subtype_part);
    match normalized_subtype {
        "x-javascript" | "ecmascript" => "javascript".to_string(),
        "xhtml+xml" => "html".to_string(),
        value => value.to_string(),
    }
}

fn summary_content_type_label(
    request_content_type: Option<&str>,
    response_content_type: Option<&str>,
) -> String {
    if let Some(content_type) = response_content_type.filter(|value| !value.is_empty()) {
        return normalize_content_type_label(content_type);
    }
    if let Some(content_type) = request_content_type.filter(|value| !value.is_empty()) {
        return normalize_content_type_label(content_type);
    }
    "—".to_string()
}

fn summary_status_text(entry: &TrafficEntry) -> String {
    if entry.error.is_some() {
        return "err error".to_string();
    }
    if entry.pending {
        return "pending wait pend".to_string();
    }
    if entry.mitm_bypassed {
        return "bypass byps bypassed".to_string();
    }
    entry
        .response_status
        .map(|status| format!("http {status}"))
        .unwrap_or_else(|| "http".to_string())
}

fn summary_search_text(
    entry: &TrafficEntry,
    request_content_type: Option<&str>,
    response_content_type: Option<&str>,
    requester_app_name: &str,
) -> String {
    let response_status = entry
        .response_status
        .map(|status| status.to_string())
        .unwrap_or_default();
    let content_type = summary_content_type_label(request_content_type, response_content_type);
    let status_text = summary_status_text(entry);
    [
        entry.url.as_str(),
        response_status.as_str(),
        entry.method.as_str(),
        content_type.as_str(),
        requester_app_name,
        status_text.as_str(),
    ]
    .join(" ")
    .to_lowercase()
}

fn requester_app_name(entry: &TrafficEntry) -> String {
    if let Some(app_name) = entry.app_name.as_deref().map(str::trim) {
        if !app_name.is_empty() {
            return normalize_requester_app_name(app_name);
        }
    }
    let Some(user_agent) = header_value(&entry.request_headers, "user-agent") else {
        return if entry.peer.is_empty() {
            "—".to_string()
        } else {
            entry.peer.clone()
        };
    };
    let normalized_user_agent = user_agent.to_ascii_lowercase();
    if normalized_user_agent.contains("edg/") {
        return "Microsoft Edge".to_string();
    }
    if normalized_user_agent.contains("chrome/") && !normalized_user_agent.contains("edg/") {
        return "Google Chrome".to_string();
    }
    if normalized_user_agent.contains("firefox/") {
        return "Mozilla Firefox".to_string();
    }
    if normalized_user_agent.contains("safari/")
        && !normalized_user_agent.contains("chrome/")
        && !normalized_user_agent.contains("chromium/")
    {
        return "Safari".to_string();
    }
    let first_token = user_agent.trim().split_whitespace().next().unwrap_or("");
    let product_name = first_token.split('/').next().unwrap_or("");
    if product_name.is_empty() {
        entry.peer.clone()
    } else {
        product_name.to_string()
    }
}

fn normalize_requester_app_name(app_name: &str) -> String {
    let app_name = app_name.trim();
    let helper_suffixes = [
        " Helper (Plugin)",
        " Helper (Renderer)",
        " Helper (GPU)",
        " Helper (Alerts)",
        " Helper",
    ];
    for suffix in helper_suffixes {
        if let Some(base_name) = app_name.strip_suffix(suffix) {
            let base_name = base_name.trim();
            if !base_name.is_empty() {
                return base_name.to_string();
            }
        }
    }
    app_name.to_string()
}

#[cfg(test)]
#[path = "state_tests.rs"]
mod state_tests;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakpointRule {
    pub id: Uuid,
    pub name: String,
    pub enabled: bool,
    /// e.g. `GET` / `POST`; empty means match any method.
    pub match_method: Option<String>,
    /// Exact origin match, e.g. `https://example.com` or `http://localhost:3000`.
    pub match_origin: Option<String>,
    /// Plain path string match (after normalization to leading `/`).
    pub match_path_regex: Option<String>,
}

impl BreakpointRule {
    pub fn matches(&self, method: &str, origin: &str, path: &str) -> bool {
        if !self.enabled {
            return false;
        }
        if let Some(ref expected_method) = self.match_method {
            let want = expected_method.trim();
            if !want.is_empty() && !want.eq_ignore_ascii_case(method) {
                return false;
            }
        }
        if let Some(ref expected_origin) = self.match_origin {
            if !expected_origin.eq_ignore_ascii_case(origin) {
                return false;
            }
        }
        if let Some(ref expected_path) = self.match_path_regex {
            let want = expected_path.trim();
            if !want.is_empty() && normalize_path(path) != normalize_path(want) {
                return false;
            }
        }
        true
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum DashboardMessage {
    #[serde(rename = "snapshot")]
    Snapshot { requests: Vec<TrafficEntrySummary> },
    #[serde(rename = "traffic")]
    Traffic { entry: TrafficEntrySummary },
    #[serde(rename = "overrides_updated")]
    OverridesUpdated,
    #[serde(rename = "breakpoints_updated")]
    BreakpointsUpdated,
    #[serde(rename = "proxy_listen_updated")]
    ProxyListenUpdated {
        proxy_listen_ipv4: Option<String>,
        proxy_port: u16,
    },
    #[serde(rename = "ui_action")]
    UiAction { action: UiActionMessage },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "action")]
pub enum UiActionMessage {
    #[serde(rename = "focus_main_window")]
    FocusMainWindow,
    #[serde(rename = "open_floating_traffic_window")]
    OpenFloatingTrafficWindow,
    #[serde(rename = "select_request")]
    SelectRequest { request_id: Uuid },
    #[serde(rename = "set_url_filter")]
    SetUrlFilter { query: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficEntry {
    pub id: Uuid,
    pub at: DateTime<Utc>,
    /// Client that opened this connection to the proxy (e.g. curl, browser).
    pub peer: String,
    /// Best-effort client application/process name (for dashboard display).
    pub app_name: Option<String>,
    pub method: String,
    pub url: String,
    pub scheme: String,
    pub host: String,
    pub path: String,
    pub request_headers: Vec<(String, String)>,
    pub request_body_preview: Option<String>,
    pub kind: TrafficKind,
    #[serde(default)]
    pub mitm_bypassed: bool,
    pub response_status: Option<u16>,
    pub response_headers: Option<Vec<(String, String)>>,
    pub response_body_preview: Option<String>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
    #[serde(default)]
    pub pending: bool,
    pub breakpoint_name: Option<String>,
    #[serde(default)]
    pub override_match_id: Option<String>,
    pub breakpoint_match_id: Option<Uuid>,
    pub stream_controllable: bool,
    pub stream_playing: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficEntrySummary {
    pub id: Uuid,
    pub at: DateTime<Utc>,
    pub peer: String,
    pub app_name: Option<String>,
    pub method: String,
    pub url: String,
    pub scheme: String,
    pub host: String,
    pub path: String,
    pub kind: TrafficKind,
    #[serde(default)]
    pub mitm_bypassed: bool,
    pub response_status: Option<u16>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
    #[serde(default)]
    pub pending: bool,
    pub breakpoint_name: Option<String>,
    #[serde(default)]
    pub override_match_id: Option<String>,
    pub breakpoint_match_id: Option<Uuid>,
    pub stream_controllable: bool,
    pub stream_playing: Option<bool>,
    pub request_content_type: Option<String>,
    pub response_content_type: Option<String>,
    pub requester_app_name: String,
    pub websocket: bool,
    pub resource_type: String,
    pub method_tag: String,
    pub status_class: Option<String>,
    pub url_filter_text: String,
    pub search_text: String,
}

impl From<&TrafficEntry> for TrafficEntrySummary {
    fn from(entry: &TrafficEntry) -> Self {
        let request_content_type = header_value(&entry.request_headers, "content-type");
        let response_content_type = entry
            .response_headers
            .as_deref()
            .and_then(|headers| header_value(headers, "content-type"));
        let requester_app_name = requester_app_name(entry);
        let websocket = is_websocket_entry(entry);
        let resource_type = classify_resource_type(entry);
        let method_tag = method_tag(entry);
        let status_class = status_class(entry);
        let url_filter_text = url_filter_text(&entry.url);
        let search_text = summary_search_text(
            entry,
            request_content_type.as_deref(),
            response_content_type.as_deref(),
            &requester_app_name,
        );
        Self {
            id: entry.id,
            at: entry.at,
            peer: entry.peer.clone(),
            app_name: entry.app_name.clone(),
            method: entry.method.clone(),
            url: entry.url.clone(),
            scheme: entry.scheme.clone(),
            host: entry.host.clone(),
            path: entry.path.clone(),
            kind: entry.kind.clone(),
            mitm_bypassed: entry.mitm_bypassed,
            response_status: entry.response_status,
            duration_ms: entry.duration_ms,
            error: entry.error.clone(),
            pending: entry.pending,
            breakpoint_name: entry.breakpoint_name.clone(),
            override_match_id: entry.override_match_id.clone(),
            breakpoint_match_id: entry.breakpoint_match_id,
            stream_controllable: entry.stream_controllable,
            stream_playing: entry.stream_playing,
            request_content_type,
            response_content_type,
            requester_app_name,
            websocket,
            resource_type,
            method_tag,
            status_class,
            url_filter_text,
            search_text,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    pub id: Uuid,
    pub saved_at: DateTime<Utc>,
    pub entry: TrafficEntry,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrafficKind {
    Http,
    Connect,
}

pub struct AppState {
    pub tx: broadcast::Sender<DashboardMessage>,
    pub traffic: Arc<RwLock<Vec<TrafficEntry>>>,
    pub overrides: Arc<RwLock<Vec<OverrideRule>>>,
    pub breakpoints: Arc<RwLock<Vec<BreakpointRule>>>,
    pub pending_requests: Arc<Mutex<HashMap<Uuid, oneshot::Sender<()>>>>,
    pub stream_controllers: Arc<Mutex<HashMap<Uuid, watch::Sender<bool>>>>,
    pub stream_preview_buffers: Arc<Mutex<HashMap<Uuid, Arc<Mutex<Vec<u8>>>>>>,
    pub auto_mitm_bypass_hosts: Arc<RwLock<HashSet<String>>>,
    pub override_db_path: PathBuf,
    pub upstream_http_client: reqwest::Client,
    pub upstream_http3_client: Option<reqwest::Client>,
    pub upstream_http3_enabled: bool,
    pub max_traffic: usize,
    pub billing: Arc<crate::billing::BillingState>,
    pub request_catalog: Arc<crate::request_catalog::RequestCatalogRecorder>,
    /// When set, HTTPS CONNECT is intercepted (TLS MITM) so decrypted HTTP is logged.
    pub mitm: Option<Arc<crate::mitm::Mitm>>,
    /// Absolute path to `ca.pem` on disk when MITM is enabled (default `…/mitm-ca-rsa/ca.pem`; desktop installers).
    pub mitm_ca_pem_path: Option<PathBuf>,
    /// 是否由 dashboard 控制暂停抓包。
    pub capture_paused: AtomicBool,
    /// 清空 traffic 时递增，用于让旧流式连接停止继续累积/写回预览。
    pub traffic_generation: AtomicU64,
}

impl AppState {
    pub fn new(
        max_traffic: usize,
        mitm: Option<Arc<crate::mitm::Mitm>>,
        mitm_ca_pem_path: Option<PathBuf>,
        override_db_path: PathBuf,
        overrides: Vec<OverrideRule>,
        breakpoints: Vec<BreakpointRule>,
        upstream_http_client: reqwest::Client,
        upstream_http3_client: Option<reqwest::Client>,
        upstream_http3_enabled: bool,
    ) -> Self {
        let (tx, _) = broadcast::channel(2048);
        let billing = Arc::new(
            crate::billing::BillingState::init(&override_db_path).unwrap_or_else(|error| {
                crate::billing::BillingState::trial_only(
                    override_db_path.clone(),
                    error.to_string(),
                )
            }),
        );
        Self {
            tx,
            traffic: Arc::new(RwLock::new(Vec::new())),
            overrides: Arc::new(RwLock::new(overrides)),
            breakpoints: Arc::new(RwLock::new(breakpoints)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            stream_controllers: Arc::new(Mutex::new(HashMap::new())),
            stream_preview_buffers: Arc::new(Mutex::new(HashMap::new())),
            auto_mitm_bypass_hosts: Arc::new(RwLock::new(HashSet::new())),
            request_catalog: Arc::new(crate::request_catalog::RequestCatalogRecorder::new(
                override_db_path.clone(),
            )),
            override_db_path,
            upstream_http_client,
            upstream_http3_client,
            upstream_http3_enabled,
            max_traffic,
            billing,
            mitm,
            mitm_ca_pem_path,
            capture_paused: AtomicBool::new(false),
            traffic_generation: AtomicU64::new(0),
        }
    }

    pub fn push_traffic(&self, entry: TrafficEntry) {
        if self.capture_paused.load(Ordering::Relaxed) {
            return;
        }
        let mut log = self.traffic.write();
        if log.len() >= self.max_traffic {
            let drop = log.len() - self.max_traffic + 1;
            log.drain(0..drop);
        }
        let summary = TrafficEntrySummary::from(&entry);
        log.push(entry);
        drop(log);
        let _ = self.tx.send(DashboardMessage::Traffic { entry: summary });
    }

    pub fn update_traffic(&self, id: Uuid, update: TrafficUpdate) {
        let mut log = self.traffic.write();
        if let Some(e) = log.iter_mut().find(|e| e.id == id) {
            if let Some(s) = update.response_status {
                e.response_status = Some(s);
            }
            if let Some(h) = update.response_headers {
                e.response_headers = Some(h);
            }
            if let Some(b) = update.response_body_preview {
                e.response_body_preview = Some(b);
            }
            if let Some(d) = update.duration_ms {
                e.duration_ms = Some(d);
            }
            if let Some(err) = update.error {
                e.error = Some(err);
            }
            if let Some(p) = update.pending {
                e.pending = p;
            }
            if let Some(name) = update.breakpoint_name {
                e.breakpoint_name = Some(name);
            }
            if let Some(override_match_id) = update.override_match_id {
                e.override_match_id = Some(override_match_id);
            }
            if let Some(breakpoint_match_id) = update.breakpoint_match_id {
                e.breakpoint_match_id = Some(breakpoint_match_id);
            }
            if let Some(c) = update.stream_controllable {
                e.stream_controllable = c;
            }
            if let Some(p) = update.stream_playing {
                e.stream_playing = Some(p);
            }
            let should_record_catalog = !e.pending;
            let catalog_entry = if should_record_catalog {
                Some(e.clone())
            } else {
                None
            };
            let entry = TrafficEntrySummary::from(&*e);
            drop(log);
            if let Some(catalog_entry) = catalog_entry {
                self.request_catalog
                    .record_traffic_candidate(&catalog_entry);
            }
            let _ = self.tx.send(DashboardMessage::Traffic { entry });
        }
    }

    pub fn traffic_summaries(&self) -> Vec<TrafficEntrySummary> {
        self.traffic
            .read()
            .iter()
            .map(TrafficEntrySummary::from)
            .collect()
    }

    pub fn traffic_detail(&self, id: Uuid) -> Option<TrafficEntry> {
        self.traffic
            .read()
            .iter()
            .find(|entry| entry.id == id)
            .cloned()
    }

    pub fn clear_traffic_releasing_capacity(&self) {
        *self.traffic.write() = Vec::new();
        self.traffic_generation.fetch_add(1, Ordering::Relaxed);
        self.clear_all_stream_preview_buffers();
    }

    pub fn traffic_generation(&self) -> u64 {
        self.traffic_generation.load(Ordering::Relaxed)
    }

    pub fn is_current_traffic_generation(&self, generation: u64) -> bool {
        self.traffic_generation() == generation
    }

    pub fn notify_overrides_changed(&self) {
        let _ = self.tx.send(DashboardMessage::OverridesUpdated);
        self.recompute_rule_matches();
    }

    pub fn notify_breakpoints_changed(&self) {
        let _ = self.tx.send(DashboardMessage::BreakpointsUpdated);
        self.recompute_rule_matches();
    }

    /// 规则变更后重算历史 HTTP 条目的命中规则 id（潜在命中：第一个 enabled 命中规则）。
    /// 历史条目只保留 `request_body_preview`，body 类匹配按预览 best-effort，与前端旧逻辑一致。
    /// 仅在有条目命中变化时广播 Snapshot，避免无谓的全量重渲染。
    pub fn recompute_rule_matches(&self) {
        let overrides = self.overrides.read();
        let breakpoints = self.breakpoints.read();
        let mut log = self.traffic.write();
        let mut has_changes = false;
        for entry in log.iter_mut() {
            if !matches!(entry.kind, TrafficKind::Http) {
                continue;
            }
            let request_query = query_pairs_from_url(&entry.url);
            let origin = entry_origin(&entry.url);
            let request_headers = header_map_from_pairs(&entry.request_headers);
            let request_body = entry.request_body_preview.as_deref().unwrap_or("");
            let next_override_match_id = overrides
                .iter()
                .find(|rule| {
                    rule.matches(
                        &entry.method,
                        &entry.scheme,
                        &entry.host,
                        &entry.path,
                        &entry.path,
                        &request_query,
                        &request_headers,
                        request_body.as_bytes(),
                    )
                })
                .map(|rule| rule.id.clone());
            let next_breakpoint_match_id = breakpoints
                .iter()
                .find(|rule| rule.matches(&entry.method, &origin, &entry.path))
                .map(|rule| rule.id);
            if entry.override_match_id != next_override_match_id {
                entry.override_match_id = next_override_match_id;
                has_changes = true;
            }
            if entry.breakpoint_match_id != next_breakpoint_match_id {
                entry.breakpoint_match_id = next_breakpoint_match_id;
                has_changes = true;
            }
        }
        if !has_changes {
            return;
        }
        let requests = log.iter().map(TrafficEntrySummary::from).collect();
        drop(log);
        drop(breakpoints);
        drop(overrides);
        let _ = self.tx.send(DashboardMessage::Snapshot { requests });
    }

    pub fn notify_proxy_listen_updated(&self, proxy_listen_ipv4: Option<String>, proxy_port: u16) {
        let _ = self.tx.send(DashboardMessage::ProxyListenUpdated {
            proxy_listen_ipv4,
            proxy_port,
        });
    }

    pub fn notify_ui_action(&self, action: UiActionMessage) {
        let _ = self.tx.send(DashboardMessage::UiAction { action });
    }

    pub fn register_pending_request(&self, id: Uuid) -> oneshot::Receiver<()> {
        let (tx, rx) = oneshot::channel();
        self.pending_requests.lock().insert(id, tx);
        rx
    }

    pub fn clear_pending_request(&self, id: Uuid) {
        self.pending_requests.lock().remove(&id);
    }

    pub fn resume_pending_request(&self, id: Uuid) -> bool {
        if let Some(tx) = self.pending_requests.lock().remove(&id) {
            let _ = tx.send(());
            true
        } else {
            false
        }
    }

    pub fn resume_all_pending_requests(&self) {
        let pending = std::mem::take(&mut *self.pending_requests.lock());
        for (_, tx) in pending {
            let _ = tx.send(());
        }
    }

    pub fn register_stream_controller(
        &self,
        id: Uuid,
        initial_playing: bool,
    ) -> watch::Receiver<bool> {
        let (tx, rx) = watch::channel(initial_playing);
        self.stream_controllers.lock().insert(id, tx);
        rx
    }

    pub fn set_stream_playing(&self, id: Uuid, playing: bool) -> bool {
        if let Some(tx) = self.stream_controllers.lock().get(&id).cloned() {
            let _ = tx.send(playing);
            self.update_traffic(
                id,
                TrafficUpdate {
                    response_status: None,
                    response_headers: None,
                    response_body_preview: None,
                    duration_ms: None,
                    error: None,
                    pending: None,
                    breakpoint_name: None,
                    override_match_id: None,
                    breakpoint_match_id: None,
                    stream_controllable: None,
                    stream_playing: Some(playing),
                },
            );
            true
        } else {
            false
        }
    }

    pub fn clear_stream_controller(&self, id: Uuid) {
        self.stream_controllers.lock().remove(&id);
    }

    pub fn clear_all_stream_controllers(&self) {
        self.stream_controllers.lock().clear();
    }

    pub fn register_stream_preview_buffer(&self, id: Uuid, buffer: Arc<Mutex<Vec<u8>>>) {
        self.stream_preview_buffers.lock().insert(id, buffer);
    }

    pub fn clear_stream_preview_buffer(&self, id: Uuid) {
        self.stream_preview_buffers.lock().remove(&id);
    }

    pub fn clear_all_stream_preview_buffers(&self) {
        let buffers = std::mem::take(&mut *self.stream_preview_buffers.lock());
        for (_, buffer) in buffers {
            *buffer.lock() = Vec::new();
        }
    }

    pub fn should_auto_bypass_mitm(&self, host: &str) -> bool {
        self.auto_mitm_bypass_hosts
            .read()
            .contains(&host.to_ascii_lowercase())
    }

    pub fn mark_auto_bypass_mitm(&self, host: &str) -> bool {
        self.auto_mitm_bypass_hosts
            .write()
            .insert(host.to_ascii_lowercase())
    }

    /// 清空因 TLS 失败而自动走隧道的域名集合（例如误 bypass 后或希望重新尝试 MITM）。
    pub fn clear_auto_mitm_bypass_hosts(&self) {
        self.auto_mitm_bypass_hosts.write().clear();
    }

    pub fn set_capture_paused(&self, paused: bool) {
        self.capture_paused.store(paused, Ordering::Relaxed);
    }

    pub fn is_capture_paused(&self) -> bool {
        self.capture_paused.load(Ordering::Relaxed)
    }
}

pub struct TrafficUpdate {
    pub response_status: Option<u16>,
    pub response_headers: Option<Vec<(String, String)>>,
    pub response_body_preview: Option<String>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
    pub pending: Option<bool>,
    pub breakpoint_name: Option<String>,
    pub override_match_id: Option<String>,
    pub breakpoint_match_id: Option<Uuid>,
    pub stream_controllable: Option<bool>,
    pub stream_playing: Option<bool>,
}
