use chrono::{DateTime, Utc};
use http::header::HeaderMap;
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, oneshot, watch};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverrideRule {
    /// SHA-256 hex (64 chars) from match identity, or an older id string from pre-hash DB rows.
    pub id: String,
    pub enabled: bool,
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
    #[serde(default)]
    pub stream_interval_ms: Option<u64>,
}

impl OverrideRule {
    pub fn matches(
        &self,
        _method: &str,
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
        // Host is always required: no "match any host" / wildcard.
        let host_want = match self.match_host.as_deref().map(str::trim) {
            Some(t) if !t.is_empty() => t,
            _ => return false,
        };
        if host.to_lowercase() != host_want.to_lowercase() {
            return false;
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

fn paths_equal(request_path: &str, rule_path: &str) -> bool {
    normalize_path(request_path) == normalize_path(rule_path)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakpointRule {
    pub id: Uuid,
    pub name: String,
    pub enabled: bool,
    /// Exact origin match, e.g. `https://example.com` or `http://localhost:3000`.
    pub match_origin: Option<String>,
    /// Regex on path (leading `/` path only, or full path).
    pub match_path_regex: Option<String>,
}

impl BreakpointRule {
    pub fn matches(&self, origin: &str, path: &str) -> bool {
        if !self.enabled {
            return false;
        }
        if let Some(ref expected_origin) = self.match_origin {
            if !expected_origin.eq_ignore_ascii_case(origin) {
                return false;
            }
        }
        if let Some(ref pattern) = self.match_path_regex {
            if let Ok(re) = regex::Regex::new(pattern) {
                return re.is_match(path);
            }
            return false;
        }
        true
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum DashboardMessage {
    #[serde(rename = "snapshot")]
    Snapshot { requests: Vec<TrafficEntry> },
    #[serde(rename = "traffic")]
    Traffic { entry: TrafficEntry },
    #[serde(rename = "overrides_updated")]
    OverridesUpdated,
    #[serde(rename = "breakpoints_updated")]
    BreakpointsUpdated,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficEntry {
    pub id: Uuid,
    pub at: DateTime<Utc>,
    /// Client that opened this connection to the proxy (e.g. curl, browser).
    pub peer: String,
    pub method: String,
    pub url: String,
    pub scheme: String,
    pub host: String,
    pub path: String,
    pub request_headers: Vec<(String, String)>,
    pub request_body_preview: Option<String>,
    pub kind: TrafficKind,
    pub response_status: Option<u16>,
    pub response_headers: Option<Vec<(String, String)>>,
    pub response_body_preview: Option<String>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
    #[serde(default)]
    pub pending: bool,
    pub breakpoint_name: Option<String>,
    #[serde(default)]
    pub stream_controllable: bool,
    pub stream_playing: Option<bool>,
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
    pub override_db_path: PathBuf,
    pub upstream_http_client: reqwest::Client,
    pub upstream_http3_client: Option<reqwest::Client>,
    pub upstream_http3_enabled: bool,
    pub max_traffic: usize,
    /// When set, HTTPS CONNECT is intercepted (TLS MITM) so decrypted HTTP is logged.
    pub mitm: Option<Arc<crate::mitm::Mitm>>,
}

impl AppState {
    pub fn new(
        max_traffic: usize,
        mitm: Option<Arc<crate::mitm::Mitm>>,
        override_db_path: PathBuf,
        overrides: Vec<OverrideRule>,
        breakpoints: Vec<BreakpointRule>,
        upstream_http_client: reqwest::Client,
        upstream_http3_client: Option<reqwest::Client>,
        upstream_http3_enabled: bool,
    ) -> Self {
        let (tx, _) = broadcast::channel(2048);
        Self {
            tx,
            traffic: Arc::new(RwLock::new(Vec::new())),
            overrides: Arc::new(RwLock::new(overrides)),
            breakpoints: Arc::new(RwLock::new(breakpoints)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            stream_controllers: Arc::new(Mutex::new(HashMap::new())),
            override_db_path,
            upstream_http_client,
            upstream_http3_client,
            upstream_http3_enabled,
            max_traffic,
            mitm,
        }
    }

    pub fn push_traffic(&self, entry: TrafficEntry) {
        let mut log = self.traffic.write();
        if log.len() >= self.max_traffic {
            let drop = log.len() - self.max_traffic + 1;
            log.drain(0..drop);
        }
        log.push(entry.clone());
        drop(log);
        let _ = self.tx.send(DashboardMessage::Traffic { entry });
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
            if let Some(c) = update.stream_controllable {
                e.stream_controllable = c;
            }
            if let Some(p) = update.stream_playing {
                e.stream_playing = Some(p);
            }
            let entry = e.clone();
            drop(log);
            let _ = self.tx.send(DashboardMessage::Traffic { entry });
        }
    }

    pub fn notify_overrides_changed(&self) {
        let _ = self.tx.send(DashboardMessage::OverridesUpdated);
    }

    pub fn notify_breakpoints_changed(&self) {
        let _ = self.tx.send(DashboardMessage::BreakpointsUpdated);
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

    pub fn register_stream_controller(&self, id: Uuid, initial_playing: bool) -> watch::Receiver<bool> {
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
}

pub struct TrafficUpdate {
    pub response_status: Option<u16>,
    pub response_headers: Option<Vec<(String, String)>>,
    pub response_body_preview: Option<String>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
    pub pending: Option<bool>,
    pub breakpoint_name: Option<String>,
    pub stream_controllable: Option<bool>,
    pub stream_playing: Option<bool>,
}
