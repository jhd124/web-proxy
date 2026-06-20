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
use hyper_util::rt::{TokioExecutor, TokioIo};
use std::convert::Infallible;
use std::io::{Cursor, Read, Write};
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command;
use tokio::sync::watch;
use tokio_rustls::TlsAcceptor as RustlsAcceptor;
use uuid::Uuid;

/// Response body: buffered (`Full`) or streamed (SSE / `text/event-stream`).
type SseStream =
    Pin<Box<dyn futures_util::Stream<Item = Result<Frame<Bytes>, reqwest::Error>> + Send>>;
type ProxyBody = Either<Full<Bytes>, StreamBody<SseStream>>;

const BODY_PREVIEW_MAX: usize = 64 * 1024;
/// Upper bound for how much of an SSE body we retain for the dashboard.
const SSE_RESPONSE_BODY_MAX: usize = 64 * 1024 * 1024;
/// Minimize WebSocket spam while still showing SSE content as it arrives.
const SSE_PREVIEW_EMIT_MIN_BYTES: usize = 2048;
const SSE_PREVIEW_EMIT_MIN_MS: u128 = 150;

/// MITM TLS accept 失败的归类，决定"是否自动把该 host 加进永久 bypass"以及"在 dashboard 上怎么提示"。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MitmAcceptFailureKind {
    /// 客户端发了明确的拒绝 alert（未信任 CA、pinning 等）。安装/信任 CA 后可恢复 MITM，
    /// 不应 auto-bypass。
    ClientCertRejection,
    /// 握手中途 EOF：TLS 1.3 客户端校验证书失败时常常静默关闭连接（Apple Network.framework、
    /// boringssl、部分 JSSE 实现），表象是 EOF 而不是 alert；也可能是客户端在做连通性探测。
    /// 两种情况都不应 auto-bypass：前者用户后续可能装 CA 解决；后者下次请求会重新建连。
    HandshakeEof,
    /// 其他握手失败（cipher 不匹配、协议版本不支持、上游真有 bug 等）。这类错误代表 MITM
    /// 当前与客户端不兼容，加进 auto-bypass 让后续请求走透明隧道更好。
    Other,
}

/// 关键词来源：rustls / openssl / native-tls (Security.framework, SChannel) 在
/// `received fatal alert`、`peer alert: <N>`、`errSSL*` 等不同后端上的错误信息差异。
fn classify_mitm_accept_error(err: &impl std::fmt::Display) -> MitmAcceptFailureKind {
    let msg = err.to_string().to_ascii_lowercase();
    let is_cert_rejection = msg.contains("unknown certificate")
        || msg.contains("certificate unknown")
        || msg.contains("bad certificate")
        || msg.contains("self signed certificate")
        || msg.contains("self-signed certificate")
        || msg.contains("certificate_verify_failed")
        || msg.contains("unknown ca")
        || msg.contains("unknown_ca")
        || msg.contains("certificate required")
        // rustls 0.23 把 AlertDescription 直接 Debug 成 CamelCase
        || msg.contains("badcertificate")
        || msg.contains("certificateunknown")
        || msg.contains("certificaterequired")
        || msg.contains("unknownca")
        || msg.contains("peerbadcert")
        // OpenSSL/Security.framework 部分实现只暴露 alert 编号
        || msg.contains("alert 42") // bad_certificate
        || msg.contains("alert 43") // unsupported_certificate
        || msg.contains("alert 44") // certificate_revoked
        || msg.contains("alert 45") // certificate_expired
        || msg.contains("alert 46") // certificate_unknown
        || msg.contains("alert 48"); // unknown_ca
    if is_cert_rejection {
        return MitmAcceptFailureKind::ClientCertRejection;
    }
    // tokio-rustls 0.26 / rustls 0.23 在握手期 IO 提前结束时返回 `tls handshake eof`；
    // 也兼容 io::Error::kind == UnexpectedEof 的常见英文措辞。
    if msg.contains("tls handshake eof")
        || msg.contains("unexpected eof")
        || msg.contains("connection reset by peer")
        || msg.contains("broken pipe")
    {
        return MitmAcceptFailureKind::HandshakeEof;
    }
    MitmAcceptFailureKind::Other
}

fn mitm_accept_failure_hint(kind: MitmAcceptFailureKind, host: &str) -> &'static str {
    match kind {
        MitmAcceptFailureKind::ClientCertRejection => {
            "客户端拒绝代理证书（未信任 CA 或证书 pinning）。装好 /api/mitm/ca.pem 并信任后可重试 MITM。"
        }
        MitmAcceptFailureKind::HandshakeEof => {
            "握手中 EOF。常见于 TLS 1.3 客户端静默拒绝证书（同样请确认 CA 已被信任），\
             或客户端只是做了一次连通性探测；不会自动加入 bypass。"
        }
        MitmAcceptFailureKind::Other => {
            // host 暂不直接用于文案，但保留参数以便后续按域名定制提示。
            let _ = host;
            "握手失败（cipher / 协议版本 / 客户端 bug 等）。已自动加入 auto-bypass，后续请求走透明隧道。"
        }
    }
}

/// CONNECT 隧道里前几个字节看起来像 TLS ClientHello（`type=handshake`，`legacy_version=0x03,0x0[0..4]`）。
/// 仅检查 record header 即可可靠区分 TLS 与 MQTT/XMPP/WebSocket(plain)/HTTP 等明文协议。
fn looks_like_tls_clienthello(buf: &[u8]) -> bool {
    buf.len() >= 3 && buf[0] == 0x16 && buf[1] == 0x03 && buf[2] <= 0x04
}

/// MITM 隧道在 TLS accept 之前 peek 的字节数。覆盖完整的 5 字节 record header，
/// 之后即可确定是否要走 TLS 终止。
const MITM_PEEK_BYTES: usize = 5;
/// peek 整体超时；超过则按"非 TLS / 客户端尚未发送"处理。值取得宽松一些以兼容慢速移动网络。
const MITM_PEEK_TIMEOUT: Duration = Duration::from_secs(5);

/// 在不消耗后续流量的前提下，尽量读满 `MITM_PEEK_BYTES` 个字节；超时或对端先关也直接返回已读到的部分。
async fn peek_initial_bytes<I: AsyncRead + Unpin>(io: &mut I) -> std::io::Result<Vec<u8>> {
    let mut buf = vec![0u8; MITM_PEEK_BYTES];
    let mut filled = 0;
    let started = tokio::time::Instant::now();
    while filled < MITM_PEEK_BYTES {
        let elapsed = started.elapsed();
        if elapsed >= MITM_PEEK_TIMEOUT {
            break;
        }
        let remaining = MITM_PEEK_TIMEOUT - elapsed;
        match tokio::time::timeout(remaining, io.read(&mut buf[filled..])).await {
            Ok(Ok(0)) => break,
            Ok(Ok(n)) => filled += n,
            Ok(Err(e)) => return Err(e),
            Err(_) => break,
        }
    }
    buf.truncate(filled);
    Ok(buf)
}

/// 把 peek 阶段已经从底层 IO 中读出的字节"还回"到流的最前面，让后续 TLS 解析器看到完整的 ClientHello。
struct PrependedReadIo<I> {
    prefix: Vec<u8>,
    pos: usize,
    inner: I,
}

impl<I> PrependedReadIo<I> {
    fn new(prefix: Vec<u8>, inner: I) -> Self {
        Self {
            prefix,
            pos: 0,
            inner,
        }
    }
}

impl<I: AsyncRead + Unpin> AsyncRead for PrependedReadIo<I> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        if this.pos < this.prefix.len() {
            let take = (this.prefix.len() - this.pos).min(buf.remaining());
            let end = this.pos + take;
            buf.put_slice(&this.prefix[this.pos..end]);
            this.pos = end;
            return Poll::Ready(Ok(()));
        }
        Pin::new(&mut this.inner).poll_read(cx, buf)
    }
}

impl<I: AsyncWrite + Unpin> AsyncWrite for PrependedReadIo<I> {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.get_mut().inner).poll_write(cx, buf)
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().inner).poll_flush(cx)
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().inner).poll_shutdown(cx)
    }
}

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
            GzDecoder::new(Cursor::new(bytes))
                .read_to_end(&mut out)
                .ok()?;
        }
        "deflate" => {
            ZlibDecoder::new(Cursor::new(bytes))
                .read_to_end(&mut out)
                .ok()?;
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
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("<binary>").to_string()))
        .collect()
}

fn mitm_handshake_failure_entry(
    peer: SocketAddr,
    app_name: Option<String>,
    host: &str,
    port: u16,
    request_headers: &[(String, String)],
    error: String,
    started: Instant,
) -> TrafficEntry {
    let url = if port == 443 {
        format!("https://{}", host)
    } else {
        format!("https://{}:{}", host, port)
    };
    TrafficEntry {
        id: Uuid::new_v4(),
        at: chrono::Utc::now(),
        peer: peer.to_string(),
        app_name,
        method: "CONNECT".to_string(),
        url: url.clone(),
        scheme: "https".to_string(),
        host: host.to_string(),
        path: String::new(),
        request_headers: request_headers.to_vec(),
        request_body_preview: None,
        kind: TrafficKind::Connect,
        mitm_bypassed: false,
        response_status: None,
        response_headers: None,
        response_body_preview: None,
        duration_ms: Some(started.elapsed().as_millis() as u64),
        error: Some(error),
        pending: false,
        breakpoint_name: None,
        override_match_id: None,
        breakpoint_match_id: None,
        stream_controllable: false,
        stream_playing: None,
    }
}

/// 在 MITM 启用的情况下，CONNECT 隧道里跑了非 TLS 协议（MQTT/XMPP/raw binary 等）。
/// 我们已经透明地把字节流转给上游，在控制台中以 `mitm_bypassed=true` 标记，便于排查。
fn mitm_raw_tunnel_entry(
    peer: SocketAddr,
    app_name: Option<String>,
    host: &str,
    port: u16,
    request_headers: &[(String, String)],
    started: Instant,
) -> TrafficEntry {
    let url = if port == 443 {
        format!("https://{}", host)
    } else {
        format!("https://{}:{}", host, port)
    };
    TrafficEntry {
        id: Uuid::new_v4(),
        at: chrono::Utc::now(),
        peer: peer.to_string(),
        app_name,
        method: "CONNECT".to_string(),
        url,
        scheme: "https".to_string(),
        host: host.to_string(),
        path: String::new(),
        request_headers: request_headers.to_vec(),
        request_body_preview: None,
        kind: TrafficKind::Connect,
        mitm_bypassed: true,
        response_status: Some(200),
        response_headers: None,
        response_body_preview: None,
        duration_ms: Some(started.elapsed().as_millis() as u64),
        error: None,
        pending: false,
        breakpoint_name: None,
        override_match_id: None,
        breakpoint_match_id: None,
        stream_controllable: false,
        stream_playing: None,
    }
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

/// Scheme, host, path with query, path only, and query pairs for override matching.
fn parse_url_for_override(url: &str) -> (String, String, String, String, Vec<(String, String)>) {
    if let Ok(u) = url::Url::parse(url) {
        let scheme = u.scheme().to_string();
        let host = u.host_str().unwrap_or("").to_string();
        let path_only = u.path();
        let path_only = if path_only.is_empty() {
            "/".to_string()
        } else {
            path_only.to_string()
        };
        let path_with_query = match u.query() {
            Some(q) => format!("{path_only}?{q}"),
            None => path_only.clone(),
        };
        let q: Vec<(String, String)> = u.query_pairs().into_owned().collect();
        (scheme, host, path_with_query, path_only, q)
    } else {
        let (host, pq) = parse_host_path(url);
        let scheme = if url.starts_with("https://") {
            "https".to_string()
        } else {
            "http".to_string()
        };
        let path_only = pq
            .split('?')
            .next()
            .map(|s| {
                if s.is_empty() {
                    "/".to_string()
                } else {
                    s.to_string()
                }
            })
            .unwrap_or_else(|| "/".to_string());
        (scheme, host, pq, path_only, Vec::new())
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

fn has_map_remote_rule(rule: &crate::state::OverrideRule) -> bool {
    let has_protocol = rule
        .map_remote_protocol
        .as_deref()
        .map(str::trim)
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    let has_host = rule
        .map_remote_host
        .as_deref()
        .map(str::trim)
        .map(|v| !v.is_empty())
        .unwrap_or(false);
    has_protocol && has_host
}

fn build_mapped_remote_url(
    rule: &crate::state::OverrideRule,
    path_with_query: &str,
) -> Option<String> {
    if !has_map_remote_rule(rule) {
        return None;
    }
    let protocol = rule.map_remote_protocol.as_deref()?.trim();
    let host = rule.map_remote_host.as_deref()?.trim();
    if protocol.is_empty() || host.is_empty() {
        return None;
    }
    let incoming_path = if path_with_query.trim().is_empty() {
        "/"
    } else {
        path_with_query
    };
    let target_path = match rule.map_remote_path.as_deref().map(str::trim) {
        None | Some("") | Some("*") => incoming_path.to_string(),
        Some(path_rule) => {
            let normalized = if path_rule.starts_with('/') {
                path_rule.to_string()
            } else {
                format!("/{path_rule}")
            };
            if normalized.contains('*') {
                normalized.replace('*', incoming_path.trim_start_matches('/'))
            } else {
                normalized
            }
        }
    };
    Some(format!("{protocol}://{host}{target_path}"))
}

fn find_override(
    state: &AppState,
    method: &str,
    scheme: &str,
    host: &str,
    path_with_query: &str,
    path_only: &str,
    request_query: &[(String, String)],
    request_headers: &hyper::header::HeaderMap,
    request_body: &[u8],
) -> Option<crate::state::OverrideRule> {
    let rules = state.overrides.read();
    rules
        .iter()
        .find(|r| {
            r.matches(
                method,
                scheme,
                host,
                path_with_query,
                path_only,
                request_query,
                request_headers,
                request_body,
            )
        })
        .cloned()
}

fn find_breakpoint(
    state: &AppState,
    method: &str,
    origin: &str,
    path: &str,
) -> Option<crate::state::BreakpointRule> {
    let rules = state.breakpoints.read();
    rules
        .iter()
        .find(|r| r.matches(method, origin, path))
        .cloned()
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
            let conn =
                hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new());
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
    let authority = match req.uri().authority().cloned() {
        Some(a) => a,
        None => {
            return Ok(bad_request("CONNECT missing authority"));
        }
    };
    let host = authority.host().to_string();
    let port = authority.port_u16().unwrap_or(443);
    let is_mitm_bypassed = state.mitm.is_some() && state.should_auto_bypass_mitm(&host);
    if state.mitm.is_some() && !is_mitm_bypassed {
        return handle_connect_mitm(state, peer, req).await;
    }

    let addr = format!("{}:{}", host, port);
    let pq = req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("");
    let url = if port == 443 {
        format!("https://{}{}", host, pq)
    } else {
        format!("https://{}:{}{}", host, port, pq)
    };

    let entry_id = Uuid::new_v4();
    let app_name = resolve_client_app_name(peer).await;
    let entry = TrafficEntry {
        id: entry_id,
        at: chrono::Utc::now(),
        peer: peer.to_string(),
        app_name: app_name.clone(),
        method: "CONNECT".to_string(),
        url: url.clone(),
        scheme: "https".to_string(),
        host: host.clone(),
        path: String::new(),
        request_headers: header_pairs(&req),
        request_body_preview: None,
        kind: TrafficKind::Connect,
        mitm_bypassed: is_mitm_bypassed,
        response_status: None,
        response_headers: None,
        response_body_preview: None,
        duration_ms: None,
        error: None,
        pending: false,
        breakpoint_name: None,
        override_match_id: None,
        breakpoint_match_id: None,
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
                    override_match_id: None,
                    breakpoint_match_id: None,
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
            override_match_id: None,
            breakpoint_match_id: None,
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

    let request_headers = header_pairs(&req);
    let app_name = resolve_client_app_name(peer).await;
    let state2 = state.clone();
    let host_spawn = host.clone();
    tokio::spawn(async move {
        let started = Instant::now();
        let upgraded = match hyper::upgrade::on(req).await {
            Ok(u) => u,
            Err(e) => {
                tracing::debug!("mitm upgrade: {}", e);
                state2.push_traffic(mitm_handshake_failure_entry(
                    peer,
                    app_name.clone(),
                    &host_spawn,
                    port,
                    &request_headers,
                    format!("CONNECT upgrade: {e}"),
                    started,
                ));
                return;
            }
        };
        let mut io = TokioIo::new(upgraded);

        // 先 peek 几个字节区分 TLS / 非 TLS。某些 App 会用 CONNECT 隧道转发 MQTT、XMPP、
        // 自定义二进制等非 TLS 协议；如果不识别就贸然走 TLS accept，会以 "MITM TLS accept:
        // received corrupt message" 之类失败，并误导用户以为 MITM 出了问题。
        let peeked = match peek_initial_bytes(&mut io).await {
            Ok(b) => b,
            Err(e) => {
                tracing::debug!("mitm peek {}: {}", host_spawn, e);
                state2.push_traffic(mitm_handshake_failure_entry(
                    peer,
                    app_name.clone(),
                    &host_spawn,
                    port,
                    &request_headers,
                    format!("MITM peek: {e}"),
                    started,
                ));
                return;
            }
        };

        if !looks_like_tls_clienthello(&peeked) {
            // 非 TLS：透明隧道转发，并把该 host 加入 auto-bypass，后续 CONNECT 走 fast path。
            // peek 为空（客户端尚未发送任何字节）也走这条路径，以兼容 server-first 协议。
            let addr = format!("{}:{}", host_spawn, port);
            match TcpStream::connect(&addr).await {
                Ok(mut upstream) => {
                    state2.mark_auto_bypass_mitm(&host_spawn);
                    if !peeked.is_empty() {
                        if let Err(e) = upstream.write_all(&peeked).await {
                            tracing::debug!("mitm raw tunnel write {}: {}", host_spawn, e);
                            return;
                        }
                    }
                    state2.push_traffic(mitm_raw_tunnel_entry(
                        peer,
                        app_name.clone(),
                        &host_spawn,
                        port,
                        &request_headers,
                        started,
                    ));
                    let _ = tokio::io::copy_bidirectional(&mut io, &mut upstream).await;
                }
                Err(e) => {
                    state2.push_traffic(mitm_handshake_failure_entry(
                        peer,
                        app_name.clone(),
                        &host_spawn,
                        port,
                        &request_headers,
                        format!("CONNECT raw upstream {addr}: {e}"),
                        started,
                    ));
                }
            }
            return;
        }

        let server_cfg = match mitm.rustls_server_config(&host_spawn) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("mitm cert {}: {}", host_spawn, e);
                state2.push_traffic(mitm_handshake_failure_entry(
                    peer,
                    app_name.clone(),
                    &host_spawn,
                    port,
                    &request_headers,
                    format!("MITM certificate: {e}"),
                    started,
                ));
                return;
            }
        };
        let acceptor = RustlsAcceptor::from(server_cfg);
        // peek 阶段已经从 io 中消耗了若干字节，需要"还回"到 ClientHello 前面再交给 TLS。
        let prepended = PrependedReadIo::new(peeked, io);
        let tls_stream = match acceptor.accept(prepended).await {
            Ok(s) => s,
            Err(e) => {
                let kind = classify_mitm_accept_error(&e);
                let hint = mitm_accept_failure_hint(kind, &host_spawn);
                match kind {
                    MitmAcceptFailureKind::ClientCertRejection
                    | MitmAcceptFailureKind::HandshakeEof => {
                        tracing::info!(
                            "mitm tls accept {}: {} ({:?}, 不加入 auto-bypass)",
                            host_spawn,
                            e,
                            kind
                        );
                    }
                    MitmAcceptFailureKind::Other => {
                        state2.mark_auto_bypass_mitm(&host_spawn);
                        tracing::warn!("mitm tls accept {}: {} (auto-bypass)", host_spawn, e);
                    }
                }
                state2.push_traffic(mitm_handshake_failure_entry(
                    peer,
                    app_name.clone(),
                    &host_spawn,
                    port,
                    &request_headers,
                    format!("MITM TLS accept: {e} — {hint}"),
                    started,
                ));
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
            async move { handle_mitm_https_request(st, peer_c, host_svc, port_svc, req).await }
        });
        // 用 auto::Builder 让接收侧根据 ALPN 自动选 HTTP/2 或 HTTP/1.1，匹配 rustls 协商结果。
        let builder = hyper_util::server::conn::auto::Builder::new(TokioExecutor::new());
        if let Err(e) = builder.serve_connection(tls_io, service).await {
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
        .body(Either::Left(Full::new(Bytes::copy_from_slice(
            msg.as_bytes(),
        ))))
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
    let effective_headers = filtered_rule_headers(
        &headers,
        stream_interval_ms.is_some(),
        keep_content_encoding,
    );
    let mut res = Response::builder()
        .status(StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));
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
                override_match_id: None,
                breakpoint_match_id: None,
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
                    override_match_id: None,
                    breakpoint_match_id: None,
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
        encode_body_for_content_encoding(body.as_bytes(), enc)
            .unwrap_or_else(|| body.as_bytes().to_vec())
    } else {
        body.as_bytes().to_vec()
    };
    let body_bytes = Bytes::from(final_body);
    let resp = res
        .body(Either::Left(Full::new(body_bytes.clone())))
        .unwrap();
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
            override_match_id: None,
            breakpoint_match_id: None,
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
        None => {
            return Ok(bad_request(
                "could not determine target URL (need absolute URI or Host)",
            ))
        }
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

fn reqwest_headers_for_upstream(headers: &hyper::header::HeaderMap) -> reqwest::header::HeaderMap {
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
            req_headers.append(name, val);
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
    let (scheme, host, path_with_query, path_only, request_query) = parse_url_for_override(&url);
    let origin = parse_origin(&url);

    let req_body_preview = preview_bytes(&collected);
    let req_headers = reqwest_headers_for_upstream(request_headers);
    let matched_override = find_override(
        &state,
        method.as_str(),
        &scheme,
        &host,
        &path_with_query,
        &path_only,
        &request_query,
        request_headers,
        collected.as_ref(),
    );
    let matched_breakpoint = find_breakpoint(&state, method.as_str(), &origin, &path_only);
    let mapped_remote_url = matched_override
        .as_ref()
        .and_then(|rule| build_mapped_remote_url(rule, &path_with_query));
    let app_name = resolve_client_app_name(peer).await;

    let entry_id = Uuid::new_v4();
    let entry = TrafficEntry {
        id: entry_id,
        at: chrono::Utc::now(),
        peer: peer.to_string(),
        app_name,
        method: method.to_string(),
        url: url.clone(),
        scheme: scheme.clone(),
        host: host.clone(),
        path: path_only.clone(),
        request_headers: request_headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("<binary>").to_string()))
            .collect(),
        request_body_preview: req_body_preview.clone(),
        kind: TrafficKind::Http,
        mitm_bypassed: false,
        response_status: None,
        response_headers: None,
        response_body_preview: None,
        duration_ms: None,
        error: None,
        pending: false,
        breakpoint_name: None,
        override_match_id: matched_override.as_ref().map(|rule| rule.id.clone()),
        breakpoint_match_id: matched_breakpoint.as_ref().map(|rule| rule.id),
        stream_controllable: false,
        stream_playing: None,
    };
    state.push_traffic(entry);

    let mut stream_ctrl = None;
    if let Some(rule) = matched_breakpoint {
        let has_controlled_stream = matched_override
            .as_ref()
            .filter(|r| !has_map_remote_rule(r))
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
                override_match_id: None,
                breakpoint_match_id: None,
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
                override_match_id: None,
                breakpoint_match_id: None,
                stream_controllable: None,
                stream_playing: None,
            },
        );
    }

    if let Some(rule) = matched_override {
        if mapped_remote_url.is_none() {
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
    }

    let upstream_target_url = mapped_remote_url.unwrap_or_else(|| url.clone());

    let client = if state.upstream_http3_enabled && upstream_target_url.starts_with("https://") {
        state
            .upstream_http3_client
            .as_ref()
            .unwrap_or(&state.upstream_http_client)
    } else {
        &state.upstream_http_client
    };

    let started = Instant::now();
    let rb = client
        .request(method.clone(), upstream_target_url.clone())
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
                    override_match_id: None,
                    breakpoint_match_id: None,
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
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("<binary>").to_string()))
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
                override_match_id: None,
                breakpoint_match_id: None,
                stream_controllable: None,
                stream_playing: None,
            },
        );
        let state_c = state.clone();
        let stream_generation = state.traffic_generation();
        let acc = Arc::new(parking_lot::Mutex::new(Vec::new()));
        state.register_stream_preview_buffer(entry_id, acc.clone());
        let acc_in = acc.clone();
        let mut last_emit = Instant::now();
        let mut last_emit_len: usize = 0;
        let stream_in = upstream.bytes_stream().inspect_ok(move |chunk| {
            if !state_c.is_current_traffic_generation(stream_generation) {
                let mut v = acc_in.lock();
                if !v.is_empty() {
                    *v = Vec::new();
                }
                last_emit_len = 0;
                return;
            }
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
                        override_match_id: None,
                        breakpoint_match_id: None,
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
                if state_tail.is_current_traffic_generation(stream_generation) {
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
                                override_match_id: None,
                                breakpoint_match_id: None,
                                stream_controllable: None,
                                stream_playing: None,
                            },
                        );
                    }
                }
                state_tail.clear_stream_preview_buffer(entry_id);
            })),
        };
        let stream: SseStream = Box::pin(stream);
        let mut res = Response::builder()
            .status(StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));
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
                    override_match_id: None,
                    breakpoint_match_id: None,
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
            override_match_id: None,
            breakpoint_match_id: None,
            stream_controllable: None,
            stream_playing: None,
        },
    );

    let mut res = Response::builder()
        .status(StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR));
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

#[cfg(target_os = "macos")]
async fn resolve_client_app_name(peer: SocketAddr) -> Option<String> {
    let endpoint = format!("{}:{}", peer.ip(), peer.port());
    let output = Command::new("lsof")
        .args([
            "-nP",
            &format!("-iTCP@{endpoint}"),
            "-sTCP:ESTABLISHED",
            "-Fpcn",
        ])
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    parse_lsof_client_app_name(&stdout, peer, std::process::id())
}

#[cfg(not(target_os = "macos"))]
async fn resolve_client_app_name(_peer: SocketAddr) -> Option<String> {
    None
}

#[derive(Default)]
struct LsofTcpRecord {
    pid: Option<u32>,
    command: Option<String>,
    names: Vec<String>,
}

fn parse_lsof_client_app_name(stdout: &str, peer: SocketAddr, proxy_pid: u32) -> Option<String> {
    let records = parse_lsof_tcp_records(stdout);
    let peer_endpoint = peer.to_string();
    let peer_local_prefix = format!("{peer_endpoint}->");

    records
        .iter()
        .filter(|record| record.pid != Some(proxy_pid))
        .find(|record| {
            record
                .names
                .iter()
                .any(|name| name.trim().starts_with(&peer_local_prefix))
        })
        .and_then(record_command)
        .or_else(|| {
            records
                .iter()
                .filter(|record| record.pid != Some(proxy_pid))
                .find_map(record_command)
        })
}

fn parse_lsof_tcp_records(stdout: &str) -> Vec<LsofTcpRecord> {
    let mut records = Vec::new();
    let mut current = LsofTcpRecord::default();
    for line in stdout.lines() {
        let line = line.trim();
        if let Some(pid) = line.strip_prefix('p') {
            if current.pid.is_some() || current.command.is_some() || !current.names.is_empty() {
                records.push(current);
                current = LsofTcpRecord::default();
            }
            current.pid = pid.trim().parse().ok();
        } else if let Some(command) = line.strip_prefix('c') {
            let command = command.trim();
            if !command.is_empty() {
                current.command = Some(command.to_string());
            }
        } else if let Some(name) = line.strip_prefix('n') {
            let name = name.trim();
            if !name.is_empty() {
                current.names.push(name.to_string());
            }
        }
    }
    if current.pid.is_some() || current.command.is_some() || !current.names.is_empty() {
        records.push(current);
    }
    records
}

fn record_command(record: &LsofTcpRecord) -> Option<String> {
    record
        .command
        .as_deref()
        .map(str::trim)
        .filter(|command| !command.is_empty())
        .map(ToString::to_string)
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

#[cfg(test)]
#[path = "proxy_tests.rs"]
mod proxy_tests;
