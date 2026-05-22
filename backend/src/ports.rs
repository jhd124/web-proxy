//! TCP listen port selection: scan upward from env hints until bind succeeds.
//! Embedded UI (`DASHBOARD_DIST`, e.g. Tauri) uses the same scan; chosen ports are written to
//! `PROXY_DATA_DIR/listen-ports.json` so the shell can open the correct dashboard URL.

use anyhow::Context;
use std::net::{Ipv4Addr, TcpListener};
use std::path::Path;

/// 代理与控制台监听 IPv4（全零地址 → 本机 + 局域网均可连）。
pub const LISTEN_IPV4: Ipv4Addr = Ipv4Addr::UNSPECIFIED;

const DEFAULT_PROXY: u16 = 9090;
const DEFAULT_DASHBOARD: u16 = 9091;
const MAX_SCAN: u32 = 2000;
/// Written next to app data when `DASHBOARD_DIST` is set (Tauri reads this for the webview URL).
pub const EMBEDDED_LISTEN_PORTS_FILE: &str = "listen-ports.json";

pub fn embedded_ui_mode() -> bool {
    std::env::var("DASHBOARD_DIST")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .is_some()
}

fn parse_port_from_env(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

/// First port >= `start` that accepts `LISTEN_IPV4` bind and is not in `avoid`.
pub fn find_free_listen_port(start: u16, avoid: &[u16]) -> anyhow::Result<u16> {
    let hint = start;
    let mut port = start;
    for _ in 0..MAX_SCAN {
        if avoid.contains(&port) {
            port = port
                .checked_add(1)
                .context("no free TCP port (avoid list)")?;
            continue;
        }
        match TcpListener::bind((LISTEN_IPV4, port)) {
            Ok(listener) => {
                drop(listener);
                return Ok(port);
            }
            Err(_) => {
                port = port
                    .checked_add(1)
                    .context("no free TCP port (u16 overflow)")?;
            }
        }
    }
    anyhow::bail!(
        "no free TCP port after {} attempts starting from {}",
        MAX_SCAN,
        hint
    );
}

/// Resolve proxy + dashboard ports, update `PROXY_PORT` / `DASHBOARD_PORT` env for `/api/health`.
pub fn resolve_proxy_dashboard_ports() -> anyhow::Result<(u16, u16)> {
    let proxy_hint = parse_port_from_env("PROXY_PORT", DEFAULT_PROXY);
    let dash_hint = parse_port_from_env("DASHBOARD_PORT", DEFAULT_DASHBOARD);

    let proxy = find_free_listen_port(proxy_hint, &[])?;
    let dash = find_free_listen_port(dash_hint, &[proxy])?;

    std::env::set_var("PROXY_PORT", proxy.to_string());
    std::env::set_var("DASHBOARD_PORT", dash.to_string());

    if proxy != proxy_hint || dash != dash_hint {
        tracing::info!(
            "listen ports adjusted from hints: proxy {}→{}, dashboard {}→{}",
            proxy_hint,
            proxy,
            dash_hint,
            dash
        );
    }

    if embedded_ui_mode() {
        if std::env::var("PROXY_DATA_DIR")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .is_none()
        {
            tracing::warn!(
                "DASHBOARD_DIST is set but PROXY_DATA_DIR is unset; cannot write {EMBEDDED_LISTEN_PORTS_FILE}"
            );
        } else if let Err(e) = write_embedded_listen_file(proxy, dash) {
            tracing::warn!("could not write {EMBEDDED_LISTEN_PORTS_FILE}: {e}");
        }
    } else if let Err(e) = write_dev_port_file(proxy, dash) {
        tracing::warn!("could not write frontend/.proxy-dev-ports.json: {e}");
    }

    Ok((proxy, dash))
}

fn write_embedded_listen_file(proxy: u16, dash: u16) -> std::io::Result<()> {
    let Some(dir) = std::env::var("PROXY_DATA_DIR")
        .ok()
        .filter(|s| !s.trim().is_empty())
    else {
        return Ok(());
    };
    let root = Path::new(&dir);
    std::fs::create_dir_all(root)?;
    let out = root.join(EMBEDDED_LISTEN_PORTS_FILE);
    let body = serde_json::json!({
        "proxyPort": proxy,
        "dashboardPort": dash,
    });
    std::fs::write(out, serde_json::to_string_pretty(&body)?)
}

fn write_dev_port_file(proxy: u16, dash: u16) -> std::io::Result<()> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let out = manifest_dir
        .parent()
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "CARGO_MANIFEST_DIR has no parent",
            )
        })?
        .join("frontend/.proxy-dev-ports.json");
    let body = serde_json::json!({
        "proxyPort": proxy,
        "dashboardPort": dash,
    });
    std::fs::write(out, serde_json::to_string_pretty(&body)?)
}
