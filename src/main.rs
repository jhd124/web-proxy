mod api;
mod breakpoints;
mod mitm;
mod override_identity;
mod overrides;
mod proxy;
mod state;

use anyhow::Context;
use state::AppState;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("proxy_app=info".parse().unwrap()),
        )
        .init();

    let proxy_port: u16 = std::env::var("PROXY_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9090);
    let dashboard_port: u16 = std::env::var("DASHBOARD_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(9091);

    let max_traffic: usize = std::env::var("MAX_TRAFFIC")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(2000);
    let upstream_http3_enabled = std::env::var("UPSTREAM_HTTP3")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let mitm_enabled = std::env::var("MITM")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let mitm = if mitm_enabled {
        let dir = std::env::var("MITM_CA_DIR").unwrap_or_else(|_| "mitm-ca".to_string());
        Some(Arc::new(
            mitm::Mitm::load_or_create(&PathBuf::from(dir)).context("MITM CA")?,
        ))
    } else {
        None
    };

    let override_db_path =
        PathBuf::from(std::env::var("OVERRIDE_DB").unwrap_or_else(|_| "proxy-overrides.sqlite3".to_string()));
    let overrides = overrides::init_and_load(&override_db_path).context("override sqlite init")?;
    let breakpoints = Vec::new();

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
        override_db_path,
        overrides,
        breakpoints,
        upstream_http_client,
        upstream_http3_client,
        upstream_http3_enabled,
    ));
    let proxy_state = state.clone();
    let dashboard_state = state.clone();

    let proxy_addr: SocketAddr = format!("127.0.0.1:{}", proxy_port)
        .parse()
        .context("parse PROXY_PORT")?;
    let dashboard_addr: SocketAddr = format!("127.0.0.1:{}", dashboard_port)
        .parse()
        .context("parse DASHBOARD_PORT")?;

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
        "proxy={} dashboard=http://{} (set HTTP_PROXY=http://127.0.0.1:{}){}{}",
        proxy_addr,
        dashboard_addr,
        proxy_port,
        if mitm_enabled {
            " MITM=1: open /api/mitm/ca.pem and install the CA to decrypt HTTPS in the dashboard"
        } else {
            ""
        },
        if upstream_http3_enabled {
            " UPSTREAM_HTTP3=1: proxy will use HTTP/3 only for upstream HTTPS requests where configured"
        } else {
            ""
        }
    );

    tokio::signal::ctrl_c().await?;
    tokio::time::sleep(Duration::from_millis(0)).await;
    Ok(())
}
