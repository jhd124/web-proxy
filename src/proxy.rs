use crate::state::{AppState, TrafficEntry, TrafficKind, TrafficUpdate};
use async_stream::stream;
use brotli::CompressorWriter;
use bytes::Bytes;
use flate2::read::{GzDecoder, ZlibDecoder};
use flate2::write::{GzEncoder, ZlibEncoder};
use flate2::Compression;
use futures_util::{Stream, TryStreamExt};
use http_body::Frame;
use http_body_util::{BodyExt, Either, Full, StreamBody};
use hyper::body::Incoming;
use hyper::header::{HeaderName, HeaderValue};
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::convert::Infallible;
use std::io::{Cursor, Read, Write};
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use uuid::Uuid;

/// Response body: buffered (`Full`) or streamed (SSE / `text/event-stream`).
type SseStream = Pin<Box<dyn futures_util::Stream<Item = Result<Frame<Bytes>, reqwest::Error>> + Send>>;
type ProxyBody = Either<Full<Bytes>, StreamBody<SseStream>>;

const BODY_PREVIEW_MAX: usize = 64 * 1024;
/// Upper bound for how much of an SSE body we retain for the dashboard (memory safety).
const SSE_RESPONSE_BODY_MAX: usize = 64 * 1024 * 1024;
/// Minimize WebSocket spam while still showing SSE content as it arrives.
const SSE_PREVIEW_EMIT_MIN_BYTES: usize = 2048;
const SSE_PREVIEW_EMIT_MIN_MS: u128 = 150;

fn maybe_decode_response_body(
    headers: &reqwest::header::HeaderMap,
    bytes: &[u8],
) -> Option<(String, Vec<u8>)> {
    let encoding = headers
        .get(reqwest::header::CONTENT_ENCODING)?
        .to_str()
        .ok()?
        .to_ascii_lowercase();
    let first = encoding
        .split(',')
        .next()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())?;
    let mut out = Vec::new();
    match first {
        "gzip" | "x-gzip" => {
            GzDecoder::new(Cursor::new(bytes)).read_to_end(&mut out).ok()?;
        }
        "deflate" => {
            ZlibDecoder::new(Cursor::new(bytes)).read_to_end(&mut out).ok()?;
        }
        "br" => {
            brotli::Decompressor::new(Cursor::new(bytes), 4096)
                .read_to_end(&mut out)
                .ok()?;
        }
        "zstd" => {
            zstd::stream::read::Decoder::new(Cursor::new(bytes))
                .ok()?
                .read_to_end(&mut out)
                .ok()?;
        }
        _ => return None,
    }
    Some((first.to_string(), out))
}

fn response_content_encoding(headers: &[(String, String)]) -> Option<String> {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-encoding"))
        .map(|(_, v)| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty())
}

fn encode_body_for_content_encoding(bytes: &[u8], encoding: &str) -> Option<Vec<u8>> {
    let first = encoding
        .split(',')
        .next()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())?;
    match first {
        "gzip" | "x-gzip" => {
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(bytes).ok()?;
            encoder.finish().ok()
        }
        "deflate" => {
            let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(bytes).ok()?;
            encoder.finish().ok()
        }
        "br" => {
            let mut out = Vec::new();
            {
                let mut encoder = CompressorWriter::new(&mut out, 4096, 5, 22);
                encoder.write_all(bytes).ok()?;
            }
            Some(out)
        }
        "zstd" => zstd::stream::encode_all(Cursor::new(bytes), 0).ok(),
        _ => None,
    }
}

fn filtered_rule_headers(
    headers: &[(String, String)],
    streamed: bool,
    keep_content_encoding: bool,
) -> Vec<(String, String)> {
    headers
        .iter()
        .filter(|(k, _)| {
            if k.eq_ignore_ascii_case("content-length") {
                return false;
            }
            if !keep_content_encoding && k.eq_ignore_ascii_case("content-encoding") {
                return false;
            }
            if streamed && skip_header_for_streamed_body(k) {
                return false;
            }
            true
        })
        .cloned()
        .collect()
}

async fn wait_until_stream_playing(ctrl: &mut watch::Receiver<bool>) {
    loop {
        if *ctrl.borrow() {
            return;
        }
        if ctrl.changed().await.is_err() {
            return;
        }
    }
}

/// After the upstream byte stream ends, emit one last preview (catches tail after throttling).
struct EndFlush<S> {
    inner: S,
    on_end: Option<Box<dyn FnOnce() + Send>>,
}

impl<S> Stream for EndFlush<S>
where
    S: Stream<Item = Result<Frame<Bytes>, reqwest::Error>> + Unpin,
{
    type Item = Result<Frame<Bytes>, reqwest::Error>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        match Pin::new(&mut this.inner).poll_next(cx) {
            Poll::Ready(None) => {
                if let Some(f) = this.on_end.take() {
                    f();
                }
                Poll::Ready(None)
            }
            other => other,
        }
    }
}

/// Split on blank lines (`\n\n`). Empty segments are kept so an “empty line” between
/// delimiters is yielded as its own chunk (e.g. `a\n\n\n\nb` → `a`, ``, `b`).
fn split_rule_body_by_empty_lines(s: &str) -> Vec<String> {
    s.split("\n\n").map(|p| p.to_string()).collect()
}

/// Headers that must not be copied when the body is streamed (chunked); in particular
/// `content-length` makes clients wait for a fixed byte count and breaks SSE.
fn skip_header_for_streamed_body(name: &str) -> bool {
    name.eq_ignore_ascii_case("connection")
        || name.eq_ignore_ascii_case("keep-alive")
        || name.eq_ignore_ascii_case("transfer-encoding")
        || name.eq_ignore_ascii_case("upgrade")
        || name.eq_ignore_ascii_case("content-length")
}

fn header_pairs(req: &Request<Incoming>) -> Vec<(String, String)> {
    req.headers()
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                v.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect()
}

fn normalize_proxy_url(req: &Request<Incoming>) -> Option<String> {
    let uri = req.uri();
    if uri.scheme().is_some() {
        return Some(uri.to_string());
    }
    let host = req.headers().get("host")?.to_str().ok()?;
    let pq = uri
        .path_and_query()
        .map(|p| p.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("/");
    Some(format!("http://{}{}", host, pq))
}

fn parse_host_path(url: &str) -> (String, String) {
    if let Ok(u) = url::Url::parse(url) {
        let host = u.host_str().unwrap_or("").to_string();
        let path = u.path();
        let path = if path.is_empty() { "/" } else { path };
        let path = match u.query() {
            Some(q) => format!("{}?{}", path, q),
            None => path.to_string(),
        };
        (host, path)
    } else {
        (String::new(), url.to_string())
    }
}

fn parse_origin(url: &str) -> String {
    if let Ok(u) = url::Url::parse(url) {
        let scheme = u.scheme();
        let host = u.host_str().unwrap_or("");
        if let Some(port) = u.port() {
            format!("{}://{}:{}", scheme, host, port)
        } else {
            format!("{}://{}", scheme, host)
        }
    } else {
        String::new()
    }
}

fn find_override(
    state: &AppState,
    method: &str,
    host: &str,
    path: &str,
) -> Option<crate::state::OverrideRule> {
    let rules = state.overrides.read();
    rules
        .iter()
        .find(|r| r.matches(method, host, path))
        .cloned()
}

fn find_breakpoint(state: &AppState, origin: &str, path: &str) -> Option<crate::state::BreakpointRule> {
    let rules = state.breakpoints.read();
    rules.iter().find(|r| r.matches(origin, path)).cloned()
}

pub async fn run_proxy(bind: SocketAddr, state: Arc<AppState>) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind).await?;
    tracing::info!("proxy listening on http://{}", bind);

    loop {
        let (stream, peer) = listener.accept().await?;
        let state = state.clone();
        tokio::spawn(async move {
            let io = TokioIo::new(stream);
            let svc_state = state.clone();
            let service = hyper::service::service_fn(move |req| {
                let st = svc_state.clone();
                handle_request(st, peer, req)
            });
            // CONNECT (HTTPS in browsers) requires HTTP/1 upgrade support; plain
            // `serve_connection` does not enable `.with_upgrades()` on the http1 path.
            let conn = hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new());
            if let Err(e) = conn.serve_connection_with_upgrades(io, service).await {
                tracing::debug!(?peer, "connection closed: {}", e);
            }
        });
    }
}

async fn handle_request(
    state: Arc<AppState>,
    peer: SocketAddr,
    req: Request<Incoming>,
) -> Result<Response<ProxyBody>, Infallible> {
    if req.method() == &Method::CONNECT {
        return handle_connect(state, peer, req).await;
    }
    handle_http_proxy(state, peer, req).await
}

async fn handle_connect(
    state: Arc<AppState>,
    peer: SocketAddr,
    req: Request<Incoming>,
) -> Result<Response<ProxyBody>, Infallible> {
    if state.mitm.is_some() {
        return handle_connect_mitm(state, peer, req).await;
    }

    let authority = match req.uri().authority().cloned() {
        Some(a) => a,
        None => {
            return Ok(bad_request("CONNECT missing authority"));
        }
    };
    let host = authority.host().to_string();
    let port = authority.port_u16().unwrap_or(443);
    let addr = format!("{}:{}", host, port);
    let pq = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or("");
    let url = if port == 443 {
        format!("https://{}{}", host, pq)
    } else {
        format!("https://{}:{}{}", host, port, pq)
    };

    let entry_id = Uuid::new_v4();
    let entry = TrafficEntry {
        id: entry_id,
        at: chrono::Utc::now(),
        peer: peer.to_string(),
        method: "CONNECT".to_string(),
        url: url.clone(),
        scheme: "https".to_string(),
        host: host.clone(),
        path: String::new(),
        request_headers: header_pairs(&req),
        request_body_preview: None,
        kind: TrafficKind::Connect,
        response_status: None,
        response_headers: None,
        response_body_preview: None,
        duration_ms: None,
        error: None,
        pending: false,
        breakpoint_name: None,
        stream_controllable: false,
        stream_playing: None,
    };
    state.push_traffic(entry);

    let started = Instant::now();
    let mut server = match TcpStream::connect(&addr).await {
        Ok(s) => s,
        Err(e) => {
            state.update_traffic(
                entry_id,
                TrafficUpdate {
                    response_status: None,
                    response_headers: None,
                    response_body_preview: None,
                    duration_ms: Some(started.elapsed().as_millis() as u64),
                    error: Some(format!("connect {}: {}", addr, e)),
                    pending: None,
                    breakpoint_name: None,
                    stream_controllable: None,
                    stream_playing: None,
                },
            );
            return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Either::Left(full_body_bytes(b"CONNECT failed")))
                .unwrap());
        }
    };

    tokio::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                let mut client_io = TokioIo::new(upgraded);
                let _ = tokio::io::copy_bidirectional(&mut client_io, &mut server).await;
            }
            Err(e) => {
                tracing::debug!("upgrade error: {}", e);
            }
        }
    });

    state.update_traffic(
        entry_id,
        TrafficUpdate {
            response_status: Some(200),
            response_headers: None,
            response_body_preview: None,
            duration_ms: Some(started.elapsed().as_millis() as u64),
            error: None,
            pending: None,
            breakpoint_name: None,
            stream_controllable: None,
            stream_playing: None,
        },
    );

    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(Either::Left(Full::new(Bytes::new())))
        .unwrap())
}

/// TLS terminate CONNECT, run HTTP/1.1 on the decrypted socket, forward like plain HTTP.
async fn handle_connect_mitm(
    state: Arc<AppState>,
    peer: SocketAddr,
    req: Request<Incoming>,
) -> Result<Response<ProxyBody>, Infallible> {
    let authority = match req.uri().authority().cloned() {
        Some(a) => a,
        None => return Ok(bad_request("CONNECT missing authority")),
    };
    let host = authority.host().to_string();
    let port = authority.port_u16().unwrap_or(443);
    let mitm = match &state.mitm {
        Some(m) => m.clone(),
        None => return Ok(bad_request("MITM not configured")),
    };

    let state2 = state.clone();
    let host_spawn = host.clone();
    tokio::spawn(async move {
        let upgraded = match hyper::upgrade::on(req).await {
            Ok(u) => u,
            Err(e) => {
                tracing::debug!("mitm upgrade: {}", e);
                return;
            }
        };
        let io = TokioIo::new(upgraded);
        let cfg = match mitm.server_config(&host_spawn) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("mitm cert {}: {}", host_spawn, e);
                return;
            }
        };
        let acceptor = tokio_rustls::TlsAcceptor::from(cfg);
        let tls_stream = match acceptor.accept(io).await {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("mitm tls accept {}: {}", host_spawn, e);
                return;
            }
        };
        let tls_io = TokioIo::new(tls_stream);
        let svc_state = state2.clone();
        let peer_c = peer;
        let host_svc = host_spawn.clone();
        let port_svc = port;
        let service = hyper::service::service_fn(move |req| {
            let st = svc_state.clone();
            let host_svc = host_svc.clone();
            async move {
                handle_mitm_https_request(st, peer_c, host_svc, port_svc, req).await
            }
        });
        let conn = hyper::server::conn::http1::Builder::new().serve_connection(tls_io, service);
        if let Err(e) = conn.await {
            tracing::debug!("mitm http connection {}: {}", host_spawn, e);
        }
    });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(Either::Left(Full::new(Bytes::new())))
        .unwrap())
}

fn mitm_full_url(host: &str, port: u16, uri: &hyper::Uri) -> String {
    let authority = if port == 443 {
        host.to_string()
    } else {
        format!("{}:{}", host, port)
    };
    let pq = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
    format!("https://{}{}", authority, pq)
}

async fn handle_mitm_https_request(
    state: Arc<AppState>,
    peer: SocketAddr,
    connect_host: String,
    connect_port: u16,
    req: Request<Incoming>,
) -> Result<Response<ProxyBody>, Infallible> {
    let method = req.method().clone();
    let url = mitm_full_url(&connect_host, connect_port, req.uri());
    let (parts, body) = req.into_parts();
    let collected = match body.collect().await {
        Ok(c) => c.to_bytes(),
        Err(e) => {
            tracing::warn!("mitm read body: {}", e);
            return Ok(Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Either::Left(full_body_bytes(b"invalid body")))
                .unwrap());
        }
    };
    forward_proxied_http(state, peer, method, url, &parts.headers, collected).await
}

fn bad_request(msg: &'static str) -> Response<ProxyBody> {
    Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .body(Either::Left(Full::new(Bytes::copy_from_slice(msg.as_bytes()))))
        .unwrap()
}

fn full_body_bytes(b: &[u8]) -> Full<Bytes> {
    Full::new(Bytes::copy_from_slice(b))
}

async fn respond_with_rule(
    state: Arc<AppState>,
    entry_id: Uuid,
    peer: SocketAddr,
    url: &str,
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
    stream_interval_ms: Option<u64>,
    mut stream_ctrl: Option<watch::Receiver<bool>>,
) -> Result<Response<ProxyBody>, Infallible> {
    let started = Instant::now();
    let content_encoding = response_content_encoding(&headers);
    let keep_content_encoding = content_encoding
        .as_deref()
        .map(|enc| encode_body_for_content_encoding(body.as_bytes(), enc).is_some())
        .unwrap_or(true);
    let effective_headers = filtered_rule_headers(&headers, stream_interval_ms.is_some(), keep_content_encoding);
    let mut res = Response::builder().status(
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
    );
    for (k, v) in &effective_headers {
        if let (Ok(name), Ok(val)) = (
            HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(v),
        ) {
            res = res.header(name, val);
        }
    }

    if let Some(interval_ms) = stream_interval_ms {
        let chunks = split_rule_body_by_empty_lines(&body);
        let body_bytes = Bytes::copy_from_slice(body.as_bytes());
        let preview = preview_bytes(&body_bytes);
        state.update_traffic(
            entry_id,
            TrafficUpdate {
                response_status: Some(status),
                response_headers: Some(effective_headers.clone()),
                response_body_preview: preview,
                duration_ms: None,
                error: None,
                pending: None,
                breakpoint_name: None,
                stream_controllable: None,
                stream_playing: None,
            },
        );
        let stream: SseStream = Box::pin(stream! {
            for (i, msg) in chunks.into_iter().enumerate() {
                if let Some(ctrl) = stream_ctrl.as_mut() {
                    wait_until_stream_playing(ctrl).await;
                }
                if i > 0 {
                    tokio::time::sleep(Duration::from_millis(interval_ms)).await;
                }
                let mut frame = Vec::with_capacity(2 + msg.len());
                frame.extend_from_slice(b"\n\n");
                frame.extend_from_slice(msg.as_bytes());
                let payload = if let Some(ref enc) = content_encoding {
                    encode_body_for_content_encoding(&frame, enc).unwrap_or(frame)
                } else {
                    frame
                };
                yield Ok(Frame::data(Bytes::from(payload)));
            }
            state.clear_stream_controller(entry_id);
            state.update_traffic(
                entry_id,
                TrafficUpdate {
                    response_status: None,
                    response_headers: None,
                    response_body_preview: None,
                    duration_ms: None,
                    error: None,
                    pending: None,
                    breakpoint_name: None,
                    stream_controllable: Some(false),
                    stream_playing: Some(false),
                },
            );
        });
        let resp = res.body(Either::Right(StreamBody::new(stream))).unwrap();
        tracing::info!(?peer, "local response {}", url);
        return Ok(resp);
    }

    let final_body = if let Some(ref enc) = content_encoding {
        encode_body_for_content_encoding(body.as_bytes(), enc).unwrap_or_else(|| body.as_bytes().to_vec())
    } else {
        body.as_bytes().to_vec()
    };
    let body_bytes = Bytes::from(final_body);
    let resp = res.body(Either::Left(Full::new(body_bytes.clone()))).unwrap();
    let preview = preview_bytes(&Bytes::copy_from_slice(body.as_bytes()));
    state.update_traffic(
        entry_id,
        TrafficUpdate {
            response_status: Some(status),
            response_headers: Some(effective_headers),
            response_body_preview: preview,
            duration_ms: Some(started.elapsed().as_millis() as u64),
            error: None,
            pending: None,
            breakpoint_name: None,
            stream_controllable: None,
            stream_playing: None,
        },
    );
    tracing::info!(?peer, "local response {}", url);
    Ok(resp)
}

async fn handle_http_proxy(
    state: Arc<AppState>,
    peer: SocketAddr,
    req: Request<Incoming>,
) -> Result<Response<ProxyBody>, Infallible> {
    let method = req.method().clone();
    let url = match normalize_proxy_url(&req) {
        Some(u) => u,
        None => return Ok(bad_request("could not determine target URL (need absolute URI or Host)")),
    };

    let (parts, body) = req.into_parts();
    let collected = match body.collect().await {
        Ok(c) => c.to_bytes(),
        Err(e) => {
            tracing::warn!("read body: {}", e);
            return Ok(Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Either::Left(full_body_bytes(b"invalid body")))
                .unwrap());
        }
    };

    forward_proxied_http(state, peer, method, url, &parts.headers, collected).await
}

fn reqwest_headers_for_upstream(
    headers: &hyper::header::HeaderMap,
) -> reqwest::header::HeaderMap {
    let mut req_headers = reqwest::header::HeaderMap::new();
    for (k, v) in headers.iter() {
        if k == "proxy-connection"
            || k == "proxy-authorization"
            || k == "connection"
            || k == "keep-alive"
            || k == "te"
            || k == "trailers"
            || k == "upgrade"
            || k == "host"
            || k == "content-length"
        {
            continue;
        }
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(k.as_str().as_bytes()),
            reqwest::header::HeaderValue::from_bytes(v.as_bytes()),
        ) {
            req_headers.insert(name, val);
        }
    }
    req_headers
}

async fn forward_proxied_http(
    state: Arc<AppState>,
    peer: SocketAddr,
    method: Method,
    url: String,
    request_headers: &hyper::header::HeaderMap,
    collected: Bytes,
) -> Result<Response<ProxyBody>, Infallible> {
    let (host, path) = parse_host_path(&url);
    let origin = parse_origin(&url);
    let scheme = if url.starts_with("https://") {
        "https"
    } else {
        "http"
    }
    .to_string();

    let req_body_preview = preview_bytes(&collected);
    let req_headers = reqwest_headers_for_upstream(request_headers);
    let matched_override = find_override(&state, method.as_str(), &host, &path);

    let entry_id = Uuid::new_v4();
    let entry = TrafficEntry {
        id: entry_id,
        at: chrono::Utc::now(),
        peer: peer.to_string(),
        method: method.to_string(),
        url: url.clone(),
        scheme,
        host: host.clone(),
        path: path.clone(),
        request_headers: request_headers
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    v.to_str().unwrap_or("<binary>").to_string(),
                )
            })
            .collect(),
        request_body_preview: req_body_preview.clone(),
        kind: TrafficKind::Http,
        response_status: None,
        response_headers: None,
        response_body_preview: None,
        duration_ms: None,
        error: None,
        pending: false,
        breakpoint_name: None,
        stream_controllable: false,
        stream_playing: None,
    };
    state.push_traffic(entry);

    let mut stream_ctrl = None;
    if let Some(rule) = find_breakpoint(&state, &origin, &path) {
        let has_controlled_stream = matched_override
            .as_ref()
            .and_then(|r| r.stream_interval_ms)
            .is_some();
        if has_controlled_stream {
            stream_ctrl = Some(state.register_stream_controller(entry_id, false));
        }
        state.update_traffic(
            entry_id,
            TrafficUpdate {
                response_status: None,
                response_headers: None,
                response_body_preview: None,
                duration_ms: None,
                error: None,
                pending: Some(true),
                breakpoint_name: Some(rule.name),
                stream_controllable: Some(has_controlled_stream),
                stream_playing: Some(false),
            },
        );
        let resume_rx = state.register_pending_request(entry_id);
        let _ = resume_rx.await;
        state.clear_pending_request(entry_id);
        state.update_traffic(
            entry_id,
            TrafficUpdate {
                response_status: None,
                response_headers: None,
                response_body_preview: None,
                duration_ms: None,
                error: None,
                pending: Some(false),
                breakpoint_name: None,
                stream_controllable: None,
                stream_playing: None,
            },
        );
    }

    if let Some(rule) = matched_override {
        return respond_with_rule(
            state,
            entry_id,
            peer,
            &url,
            rule.status,
            rule.headers,
            rule.body,
            rule.stream_interval_ms,
            stream_ctrl,
        )
        .await;
    }

    let client = if state.upstream_http3_enabled && url.starts_with("https://") {
        state
            .upstream_http3_client
            .as_ref()
            .unwrap_or(&state.upstream_http_client)
    } else {
        &state.upstream_http_client
    };

    let started = Instant::now();
    let rb = client
        .request(method.clone(), url.clone())
        .headers(req_headers)
        .body(collected.to_vec());

    let upstream = match rb.send().await {
        Ok(r) => r,
        Err(e) => {
            state.update_traffic(
                entry_id,
                TrafficUpdate {
                    response_status: None,
                    response_headers: None,
                    response_body_preview: None,
                    duration_ms: Some(started.elapsed().as_millis() as u64),
                    error: Some(e.to_string()),
                    pending: None,
                    breakpoint_name: None,
                    stream_controllable: None,
                    stream_playing: None,
                },
            );
            return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Either::Left(full_body_bytes(b"upstream error")))
                .unwrap());
        }
    };

    let status = upstream.status().as_u16();
    let resp_headers: Vec<(String, String)> = upstream
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                v.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect();

    let header_map = upstream.headers().clone();

    if is_sse_response(&upstream) {
        state.update_traffic(
            entry_id,
            TrafficUpdate {
                response_status: Some(status),
                response_headers: Some(resp_headers),
                response_body_preview: None,
                duration_ms: None,
                error: None,
                pending: None,
                breakpoint_name: None,
                stream_controllable: None,
                stream_playing: None,
            },
        );
        let state_c = state.clone();
        let acc = Arc::new(parking_lot::Mutex::new(Vec::new()));
        let acc_in = acc.clone();
        let mut last_emit = Instant::now();
        let mut last_emit_len: usize = 0;
        let stream_in = upstream.bytes_stream().inspect_ok(move |chunk| {
            {
                let mut v = acc_in.lock();
                if v.len() < SSE_RESPONSE_BODY_MAX {
                    let take = (SSE_RESPONSE_BODY_MAX - v.len()).min(chunk.len());
                    v.extend_from_slice(&chunk[..take]);
                }
            }
            let acc_len = acc_in.lock().len();
            if acc_len == 0 {
                return;
            }
            let delta = acc_len.saturating_sub(last_emit_len);
            let elapsed = last_emit.elapsed().as_millis();
            let should_emit = last_emit_len == 0
                || acc_len >= SSE_RESPONSE_BODY_MAX
                || delta >= SSE_PREVIEW_EMIT_MIN_BYTES
                || elapsed >= SSE_PREVIEW_EMIT_MIN_MS;
            if !should_emit {
                return;
            }
            last_emit = Instant::now();
            last_emit_len = acc_len;
            let snapshot = acc_in.lock().clone();
            if let Some(preview) = preview_bytes_limited(&snapshot, SSE_RESPONSE_BODY_MAX) {
                state_c.update_traffic(
                    entry_id,
                    TrafficUpdate {
                        response_status: None,
                        response_headers: None,
                        response_body_preview: Some(preview),
                        duration_ms: None,
                        error: None,
                        pending: None,
                        breakpoint_name: None,
                        stream_controllable: None,
                        stream_playing: None,
                    },
                );
            }
        });
        let state_tail = state.clone();
        let acc_tail = acc;
        let stream = EndFlush {
            inner: stream_in.map_ok(Frame::data),
            on_end: Some(Box::new(move || {
                let snapshot = acc_tail.lock().clone();
                if let Some(preview) = preview_bytes_limited(&snapshot, SSE_RESPONSE_BODY_MAX) {
                    state_tail.update_traffic(
                        entry_id,
                        TrafficUpdate {
                            response_status: None,
                            response_headers: None,
                            response_body_preview: Some(preview),
                            duration_ms: None,
                            error: None,
                            pending: None,
                            breakpoint_name: None,
                            stream_controllable: None,
                            stream_playing: None,
                        },
                    );
                }
            })),
        };
        let stream: SseStream = Box::pin(stream);
        let mut res = Response::builder().status(
            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        );
        for (k, v) in header_map.iter() {
            if skip_header_for_streamed_body(k.as_str()) {
                continue;
            }
            if let (Ok(name), Ok(val)) = (
                HeaderName::from_bytes(k.as_str().as_bytes()),
                HeaderValue::from_bytes(v.as_bytes()),
            ) {
                res = res.header(name, val);
            }
        }
        return Ok(res.body(Either::Right(StreamBody::new(stream))).unwrap());
    }

    let bytes = match upstream.bytes().await {
        Ok(b) => b,
        Err(e) => {
            state.update_traffic(
                entry_id,
                TrafficUpdate {
                    response_status: Some(status),
                    response_headers: Some(resp_headers),
                    response_body_preview: None,
                    duration_ms: Some(started.elapsed().as_millis() as u64),
                    error: Some(e.to_string()),
                    pending: None,
                    breakpoint_name: None,
                    stream_controllable: None,
                    stream_playing: None,
                },
            );
            return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Either::Left(full_body_bytes(b"read upstream body failed")))
                .unwrap());
        }
    };

    let preview = preview_response_bytes(&header_map, &bytes);
    state.update_traffic(
        entry_id,
        TrafficUpdate {
            response_status: Some(status),
            response_headers: Some(resp_headers),
            response_body_preview: preview,
            duration_ms: Some(started.elapsed().as_millis() as u64),
            error: None,
            pending: None,
            breakpoint_name: None,
            stream_controllable: None,
            stream_playing: None,
        },
    );

    let mut res = Response::builder().status(
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
    );
    for (k, v) in header_map.iter() {
        let skip = matches!(
            k.as_str(),
            "connection" | "keep-alive" | "transfer-encoding" | "upgrade"
        );
        if !skip {
            if let (Ok(name), Ok(val)) = (
                HeaderName::from_bytes(k.as_str().as_bytes()),
                HeaderValue::from_bytes(v.as_bytes()),
            ) {
                res = res.header(name, val);
            }
        }
    }

    Ok(res.body(Either::Left(Full::new(bytes))).unwrap())
}

fn is_sse_response(r: &reqwest::Response) -> bool {
    r.headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_ascii_lowercase().contains("text/event-stream"))
        .unwrap_or(false)
}

fn preview_bytes(b: &Bytes) -> Option<String> {
    preview_bytes_limited(b.as_ref(), BODY_PREVIEW_MAX)
}

fn preview_response_bytes(headers: &reqwest::header::HeaderMap, body: &Bytes) -> Option<String> {
    if let Some((_, decoded)) = maybe_decode_response_body(headers, body.as_ref()) {
        return preview_bytes_limited(&decoded, BODY_PREVIEW_MAX);
    }
    preview_bytes(body)
}

fn preview_bytes_limited(slice: &[u8], max: usize) -> Option<String> {
    if slice.is_empty() {
        return None;
    }
    let slice = if slice.len() > max {
        &slice[..max]
    } else {
        slice
    };
    match std::str::from_utf8(slice) {
        Ok(s) => Some(s.to_string()),
        Err(_) => Some(format!("<binary {} bytes>", slice.len())),
    }
}
