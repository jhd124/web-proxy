mod api;
mod body_format;
mod breakpoints;
mod mitm;
mod override_identity;
mod overrides;
mod ports;
mod proxy;
mod saved_requests;
mod state;
mod system_proxy;

use anyhow::Context;
use state::AppState;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

#[cfg(unix)]
async fn shutdown_signal() -> anyhow::Result<()> {
    use tokio::signal::unix::{signal, SignalKind};

    let mut terminate = signal(SignalKind::terminate()).context("install SIGTERM handler")?;
    tokio::select! {
        result = tokio::signal::ctrl_c() => {
            result.context("listen for Ctrl+C")?;
        }
        _ = terminate.recv() => {}
    }
    Ok(())
}

#[cfg(not(unix))]
async fn shutdown_signal() -> anyhow::Result<()> {
    tokio::signal::ctrl_c().await.context("listen for Ctrl+C")?;
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("proxy_app=info".parse().unwrap()),
        )
        .init();

    let max_traffic: usize = std::env::var("MAX_TRAFFIC")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10_000);
    let upstream_http3_enabled = std::env::var("UPSTREAM_HTTP3")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let data_dir: Option<PathBuf> = std::env::var("PROXY_DATA_DIR").ok().map(PathBuf::from);
    if let Some(ref d) = data_dir {
        let _ = std::fs::create_dir_all(d);
    }

    let mitm_enabled = std::env::var("MITM")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let mitm_dir: Option<PathBuf> = if mitm_enabled {
        Some(
            std::env::var("MITM_CA_DIR")
                .ok()
                .map(PathBuf::from)
                .or_else(|| data_dir.as_ref().map(|d| d.join("mitm-ca-rsa")))
                .unwrap_or_else(|| PathBuf::from("mitm-ca-rsa")),
        )
    } else {
        None
    };
    let mitm = if let Some(ref dir) = mitm_dir {
        Some(Arc::new(
            mitm::Mitm::load_or_create(dir).context("MITM CA")?,
        ))
    } else {
        None
    };
    let mitm_ca_pem_path = mitm_dir.map(|d| {
        let pem = d.join("ca.pem");
        std::fs::canonicalize(&pem).unwrap_or(pem)
    });

    let override_db_path = std::env::var("OVERRIDE_DB")
        .ok()
        .map(PathBuf::from)
        .or_else(|| data_dir.as_ref().map(|d| d.join("proxy-overrides.sqlite3")))
        .unwrap_or_else(|| PathBuf::from("proxy-overrides.sqlite3"));
    let overrides = overrides::init_and_load(&override_db_path).context("override sqlite init")?;
    saved_requests::init(&override_db_path).context("saved requests sqlite init")?;
    let breakpoints =
        breakpoints::load_breakpoints(&override_db_path).context("load breakpoints")?;

    let upstream_http_client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("build upstream HTTP client")?;
    let upstream_http3_client = if upstream_http3_enabled {
        Some(
            reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .http3_prior_knowledge()
                .build()
                .context("build upstream HTTP/3 client")?,
        )
    } else {
        None
    };

    let state = Arc::new(AppState::new(
        max_traffic,
        mitm,
        mitm_ca_pem_path,
        override_db_path,
        overrides,
        breakpoints,
        upstream_http_client,
        upstream_http3_client,
        upstream_http3_enabled,
    ));
    let proxy_state = state.clone();
    let dashboard_state = state.clone();

    let (proxy_port, dashboard_port) = ports::resolve_proxy_dashboard_ports()?;

    let proxy_addr: SocketAddr = (ports::LISTEN_IPV4, proxy_port).into();
    let dashboard_addr: SocketAddr = (ports::LISTEN_IPV4, dashboard_port).into();

    if std::env::var("PROXY_AUTO_SYSTEM_PROXY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
        && !system_proxy::enable_http_https_proxy(proxy_port)
    {
        tracing::warn!("failed to enable system HTTP/HTTPS proxy on startup");
    }

    tokio::spawn(async move {
        if let Err(e) = proxy::run_proxy(proxy_addr, proxy_state).await {
            tracing::error!("proxy server error: {}", e);
        }
    });

    tokio::spawn(async move {
        match api::run_dashboard(dashboard_addr, dashboard_state).await {
            Ok(()) => {}
            Err(e) => tracing::error!("dashboard server error: {}", e),
        }
    });

    tracing::info!(
        "proxy={} dashboard=http://{} (LAN: use GET /api/health field proxyListenIpv4 + proxyPort; local HTTP_PROXY=http://127.0.0.1:{}){}{}",
        proxy_addr,
        dashboard_addr,
        proxy_port,
        if mitm_enabled {
            " MITM=1: open /api/mitm/ca.pem and install the RSA CA (mitm-ca-rsa/) to decrypt HTTPS"
        } else {
            ""
        },
        if upstream_http3_enabled {
            " UPSTREAM_HTTP3=1: proxy will use HTTP/3 only for upstream HTTPS requests where configured"
        } else {
            ""
        }
    );

    shutdown_signal().await?;
    system_proxy::restore_from_last_snapshot();
    tokio::time::sleep(Duration::from_millis(0)).await;
    Ok(())
}
