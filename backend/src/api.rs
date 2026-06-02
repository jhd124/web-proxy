use crate::state::AppState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::Json;
use axum::Router;
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::time::{self, Duration};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Health {
    ok: bool,
    pub proxy_port: u16,
    pub dashboard_port: u16,
    /// When true, HTTPS is decrypted (MITM); install RSA CA PEM from `/api/mitm/ca.pem`.
    pub mitm_enabled: bool,
    /// Absolute filesystem path to the CA PEM (same bytes as `/api/mitm/ca.pem`); for desktop trust installers.
    pub mitm_ca_pem_path: Option<String>,
    /// When true, outbound HTTPS requests prefer an HTTP/3-only reqwest client.
    pub upstream_http3_enabled: bool,
    /// IPv4 used for outbound traffic (not the proxy bind address). Pair with `proxy_port` for client configuration.
    pub proxy_listen_ipv4: Option<String>,
    /// 为 true 时暂停新增抓包记录。
    pub capture_paused: bool,
}

/// Best-effort primary IPv4 on the default route (UDP connect does not send packets).
fn local_ipv4_egress() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind(("0.0.0.0", 0)).ok()?;
    socket.connect(("8.8.8.8", 80)).ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_unspecified() => Some(v4),
        _ => None,
    }
}

fn current_proxy_port() -> u16 {
    std::env::var("PROXY_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9090)
}

fn current_dashboard_port() -> u16 {
    std::env::var("DASHBOARD_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9091)
}

async fn watch_proxy_listen_ipv4(state: Arc<AppState>, proxy_port: u16) {
    let mut ticker = time::interval(Duration::from_secs(2));
    let mut last_ipv4 = local_ipv4_egress().map(|ip| ip.to_string());
    loop {
        ticker.tick().await;
        let current_ipv4 = local_ipv4_egress().map(|ip| ip.to_string());
        if current_ipv4 != last_ipv4 {
            state.notify_proxy_listen_updated(current_ipv4.clone(), proxy_port);
            last_ipv4 = current_ipv4;
        }
    }
}

/// `DASHBOARD_DIST` is set by the Tauri sidecar; otherwise we use the Vite `frontend/dist` next to the repo root.
fn dashboard_dist_dir() -> PathBuf {
    if let Ok(p) = std::env::var("DASHBOARD_DIST") {
        return PathBuf::from(p);
    }
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("CARGO_MANIFEST_DIR has parent (repo root)")
        .join("frontend/dist")
}

pub async fn run_dashboard(bind: SocketAddr, state: Arc<AppState>) -> anyhow::Result<()> {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let dist = dashboard_dist_dir();
    let static_files = ServeDir::new(&dist);

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/requests", get(list_requests))
        .route("/api/requests", delete(clear_requests))
        .route("/api/capture/pause", post(pause_capture))
        .route("/api/capture/resume", post(resume_capture))
        .route("/api/mitm/ca.pem", get(mitm_ca))
        .route("/api/mitm/auto-bypass", post(clear_mitm_auto_bypass))
        .route("/api/format-body", post(crate::body_format::format_body))
        .route("/api/overrides", get(crate::overrides::list_overrides))
        .route("/api/overrides", post(crate::overrides::create_override))
        .route("/api/overrides/:id", put(crate::overrides::update_override))
        .route(
            "/api/overrides/:id",
            delete(crate::overrides::delete_override),
        )
        .route(
            "/api/breakpoints",
            get(crate::breakpoints::list_breakpoints),
        )
        .route(
            "/api/breakpoints",
            post(crate::breakpoints::create_breakpoint),
        )
        .route(
            "/api/breakpoints/:id",
            put(crate::breakpoints::update_breakpoint),
        )
        .route(
            "/api/breakpoints/:id",
            delete(crate::breakpoints::delete_breakpoint),
        )
        .route(
            "/api/saved-requests",
            get(crate::saved_requests::list_saved_requests),
        )
        .route(
            "/api/saved-requests",
            post(crate::saved_requests::save_request),
        )
        .route(
            "/api/saved-requests",
            delete(crate::saved_requests::clear_saved_requests),
        )
        .route(
            "/api/saved-requests/:id",
            delete(crate::saved_requests::delete_saved_request),
        )
        .route("/api/ui/actions", post(ui_action))
        .route("/api/requests/:id/resume", post(resume_request))
        .route("/api/requests/:id/stream/play", post(play_stream))
        .route("/api/requests/:id/stream/pause", post(pause_stream))
        .route("/ws", get(ws_handler))
        .fallback_service(static_files)
        .layer(cors)
        .with_state(state.clone());

    let proxy_port = current_proxy_port();
    tokio::spawn(watch_proxy_listen_ipv4(state.clone(), proxy_port));

    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!("dashboard listening on http://{}", bind);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> Json<Health> {
    let proxy_port = current_proxy_port();
    let dashboard_port = current_dashboard_port();
    Json(Health {
        ok: true,
        proxy_port,
        dashboard_port,
        mitm_enabled: state.mitm.is_some(),
        mitm_ca_pem_path: state
            .mitm_ca_pem_path
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned()),
        upstream_http3_enabled: state.upstream_http3_enabled,
        proxy_listen_ipv4: local_ipv4_egress().map(|ip| ip.to_string()),
        capture_paused: state.is_capture_paused(),
    })
}

async fn clear_mitm_auto_bypass(State(state): State<Arc<AppState>>) -> StatusCode {
    state.clear_auto_mitm_bypass_hosts();
    StatusCode::NO_CONTENT
}

async fn mitm_ca(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match &state.mitm {
        Some(m) => (
            [
                (header::CONTENT_TYPE, "application/x-pem-file"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"proxy-mitm-ca-rsa.pem\"",
                ),
                (header::CACHE_CONTROL, "no-store"),
            ],
            m.ca_pem().to_string(),
        )
            .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            "MITM disabled (set MITM=1 and restart)\n",
        )
            .into_response(),
    }
}

async fn list_requests(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<crate::state::TrafficEntry>> {
    Json(state.traffic.read().clone())
}

async fn clear_requests(State(state): State<Arc<AppState>>) -> StatusCode {
    state.resume_all_pending_requests();
    state.clear_all_stream_controllers();
    state.traffic.write().clear();
    StatusCode::NO_CONTENT
}

async fn pause_capture(State(state): State<Arc<AppState>>) -> StatusCode {
    state.set_capture_paused(true);
    StatusCode::NO_CONTENT
}

async fn resume_capture(State(state): State<Arc<AppState>>) -> StatusCode {
    state.set_capture_paused(false);
    StatusCode::NO_CONTENT
}

async fn resume_request(
    axum::extract::Path(id): axum::extract::Path<uuid::Uuid>,
    State(state): State<Arc<AppState>>,
) -> StatusCode {
    if state.resume_pending_request(id) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

async fn play_stream(
    axum::extract::Path(id): axum::extract::Path<uuid::Uuid>,
    State(state): State<Arc<AppState>>,
) -> StatusCode {
    let had_stream = state.set_stream_playing(id, true);
    let had_pending = state.resume_pending_request(id);
    if had_stream || had_pending {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

async fn pause_stream(
    axum::extract::Path(id): axum::extract::Path<uuid::Uuid>,
    State(state): State<Arc<AppState>>,
) -> StatusCode {
    if state.set_stream_playing(id, false) {
        StatusCode::NO_CONTENT
    } else {
        StatusCode::NOT_FOUND
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "action")]
enum UiActionBody {
    FocusMainWindow,
    OpenFloatingTrafficWindow,
    SelectRequest { request_id: uuid::Uuid },
    SetUrlFilter { query: String },
}

async fn ui_action(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UiActionBody>,
) -> StatusCode {
    let action = match body {
        UiActionBody::FocusMainWindow => crate::state::UiActionMessage::FocusMainWindow,
        UiActionBody::OpenFloatingTrafficWindow => {
            crate::state::UiActionMessage::OpenFloatingTrafficWindow
        }
        UiActionBody::SelectRequest { request_id } => {
            crate::state::UiActionMessage::SelectRequest { request_id }
        }
        UiActionBody::SetUrlFilter { query } => {
            crate::state::UiActionMessage::SetUrlFilter { query }
        }
    };
    state.notify_ui_action(action);
    StatusCode::NO_CONTENT
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.tx.subscribe();
    let initial = state.traffic.read().clone();

    if let Ok(json) =
        serde_json::to_string(&crate::state::DashboardMessage::Snapshot { requests: initial })
    {
        let _ = socket.send(Message::Text(json)).await;
    }
    if let Ok(json) = serde_json::to_string(&crate::state::DashboardMessage::ProxyListenUpdated {
        proxy_listen_ipv4: local_ipv4_egress().map(|ip| ip.to_string()),
        proxy_port: current_proxy_port(),
    }) {
        let _ = socket.send(Message::Text(json)).await;
    }

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(ev) => {
                        if let Ok(json) = serde_json::to_string(&ev) {
                            if socket.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "api_tests.rs"]
mod api_tests;
