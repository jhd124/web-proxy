use crate::state::AppState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::Json;
use axum::Router;
use serde::Serialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Health {
    ok: bool,
    pub proxy_port: u16,
    pub dashboard_port: u16,
    /// When true, HTTPS is decrypted (MITM); install CA from `/api/mitm/ca.pem`.
    pub mitm_enabled: bool,
    /// When true, outbound HTTPS requests prefer an HTTP/3-only reqwest client.
    pub upstream_http3_enabled: bool,
}

pub async fn run_dashboard(bind: SocketAddr, state: Arc<AppState>) -> anyhow::Result<()> {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let dist = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("frontend/dist");
    let static_files = ServeDir::new(&dist);

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/requests", get(list_requests))
        .route("/api/requests", delete(clear_requests))
        .route("/api/self-test", post(self_test))
        .route("/api/mitm/ca.pem", get(mitm_ca))
        .route("/api/mocks", get(crate::mocks::list_mocks))
        .route("/api/mocks", post(crate::mocks::create_mock))
        .route("/api/mocks/:id", put(crate::mocks::update_mock))
        .route("/api/mocks/:id", delete(crate::mocks::delete_mock))
        .route("/api/overrides", get(crate::overrides::list_overrides))
        .route("/api/overrides", post(crate::overrides::create_override))
        .route("/api/overrides/:id", put(crate::overrides::update_override))
        .route("/api/overrides/:id", delete(crate::overrides::delete_override))
        .route("/api/breakpoints", get(crate::breakpoints::list_breakpoints))
        .route("/api/breakpoints", post(crate::breakpoints::create_breakpoint))
        .route("/api/breakpoints/:id", put(crate::breakpoints::update_breakpoint))
        .route("/api/breakpoints/:id", delete(crate::breakpoints::delete_breakpoint))
        .route("/api/requests/:id/resume", post(resume_request))
        .route("/api/requests/:id/stream/play", post(play_stream))
        .route("/api/requests/:id/stream/pause", post(pause_stream))
        .route("/ws", get(ws_handler))
        .fallback_service(static_files)
        .layer(cors)
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!("dashboard listening on http://{}", bind);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> Json<Health> {
    let proxy_port = std::env::var("PROXY_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9090);
    let dashboard_port = std::env::var("DASHBOARD_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9091);
    Json(Health {
        ok: true,
        proxy_port,
        dashboard_port,
        mitm_enabled: state.mitm.is_some(),
        upstream_http3_enabled: state.upstream_http3_enabled,
    })
}

async fn mitm_ca(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match &state.mitm {
        Some(m) => (
            [(header::CONTENT_TYPE, "application/x-pem-file")],
            m.ca_pem().to_string(),
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "MITM disabled (set MITM=1 and restart)\n").into_response(),
    }
}

async fn list_requests(State(state): State<Arc<AppState>>) -> Json<Vec<crate::state::TrafficEntry>> {
    Json(state.traffic.read().clone())
}

async fn clear_requests(State(state): State<Arc<AppState>>) -> StatusCode {
    state.resume_all_pending_requests();
    state.clear_all_stream_controllers();
    state.traffic.write().clear();
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

/// Sends one HTTP GET through the local proxy so the traffic list proves the pipeline works.
/// Browsers do not use `HTTP_PROXY` from the shell; this is the reliable way to see a row.
async fn self_test() -> Json<serde_json::Value> {
    let proxy_port: u16 = std::env::var("PROXY_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9090);
    let proxy_url = format!("http://127.0.0.1:{}", proxy_port);

    let proxy = match reqwest::Proxy::http(&proxy_url) {
        Ok(p) => p,
        Err(e) => {
            return Json(serde_json::json!({
                "ok": false,
                "error": format!("invalid proxy: {}", e),
            }));
        }
    };

    let client = match reqwest::Client::builder().proxy(proxy).build() {
        Ok(c) => c,
        Err(e) => {
            return Json(serde_json::json!({
                "ok": false,
                "error": format!("client: {}", e),
            }));
        }
    };

    match client.get("http://example.com/").send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            Json(serde_json::json!({ "ok": true, "upstreamStatus": status }))
        }
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.tx.subscribe();
    let initial = state.traffic.read().clone();

    if let Ok(json) = serde_json::to_string(&crate::state::DashboardMessage::Snapshot {
        requests: initial,
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

