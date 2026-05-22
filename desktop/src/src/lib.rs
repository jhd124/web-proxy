mod mitm_install;
mod system_proxy;

use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use anyhow::Context;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::RunEvent;
use tauri::Url;
use tauri::WebviewUrl;
use tauri::WebviewWindowBuilder;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const FLOATING_TRAFFIC_WINDOW_LABEL: &str = "floating-traffic";

/// 与 `desktop/src/tauri.conf.json` 的 `build.devUrl` 默认端口一致。
const DEFAULT_TAURI_DEV_VITE_PORT: u16 = 5173;

/// 开发模式 WebView 应加载 Vite（HMR），而非 `proxy-app` 提供的静态 `frontend/dist`（9091）。
fn tauri_dev_vite_url() -> String {
    if let Ok(url) = std::env::var("VITE_DEV_URL") {
        if !url.is_empty() {
            return url;
        }
    }
    let port = std::env::var("VITE_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .filter(|p| *p > 0)
        .unwrap_or(DEFAULT_TAURI_DEV_VITE_PORT);
    format!("http://127.0.0.1:{port}")
}

/// 等待 Vite 就绪后将主窗口从 9091（静态 dist）切到开发服务器，浮动窗会继承该 URL。
fn spawn_dev_navigate_main_to_vite(app: &AppHandle) {
    let dev_url = tauri_dev_vite_url();
    let Ok(url) = Url::parse(&dev_url) else {
        log::warn!("dev: invalid Vite URL: {dev_url}");
        return;
    };
    let port = url
        .port_or_known_default()
        .unwrap_or(DEFAULT_TAURI_DEV_VITE_PORT);
    let vite_addr = SocketAddr::from(([127, 0, 0, 1], port));
    let handle = app.clone();
    std::thread::spawn(move || {
        for i in 0..600u32 {
            if TcpStream::connect(vite_addr).is_ok() {
                if let Some(main) = handle.get_webview_window("main") {
                    match main.navigate(url) {
                        Ok(()) => log::info!("dev: UI at {dev_url} (Vite HMR)"),
                        Err(e) => log::warn!("dev: navigate to {dev_url}: {e}"),
                    }
                }
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
            if i == 599 {
                log::warn!("dev: timed out waiting for Vite at {dev_url}");
            }
        }
    });
}

/// Holds the bundled `proxy-app` process so we can kill it on exit (release builds only).
pub struct ProxySidecarChild(pub Mutex<Option<CommandChild>>);

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListenPortsFile {
    proxy_port: u16,
    dashboard_port: u16,
}

fn read_listen_ports_from_file(path: &Path) -> Option<(u16, u16)> {
    let raw = std::fs::read_to_string(path).ok()?;
    let p: ListenPortsFile = serde_json::from_str(&raw).ok()?;
    Some((p.proxy_port, p.dashboard_port))
}

/// `cargo run -p proxy-app` / `make dev` 写入的端口文件（与 release 的 `listen-ports.json` 字段一致）。
fn dev_workspace_proxy_ports_path() -> Option<PathBuf> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|repo_root| repo_root.join("frontend/.proxy-dev-ports.json"))
}

#[tauri::command]
async fn focus_main_window(app: AppHandle, request_id: Option<String>) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "missing main webview window".to_string())?;
    main.unminimize().map_err(|e| e.to_string())?;
    main.show().map_err(|e| e.to_string())?;
    main.set_focus().map_err(|e| e.to_string())?;
    if let Some(id) = request_id.filter(|s| !s.is_empty()) {
        main.emit("traffic-select", id).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn open_floating_traffic_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FLOATING_TRAFFIC_WINDOW_LABEL) {
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "missing main webview window".to_string())?;
    let mut floating_url = main.url().map_err(|e| e.to_string())?;
    floating_url.set_query(Some("view=floating-traffic"));

    WebviewWindowBuilder::new(
        &app,
        FLOATING_TRAFFIC_WINDOW_LABEL,
        WebviewUrl::External(floating_url),
    )
    .title("Proxy Traffic")
    .inner_size(380.0, 560.0)
    .min_inner_size(300.0, 360.0)
    .resizable(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            mitm_install::install_mitm_ca_system_trust,
            mitm_install::open_mitm_ca_file,
            focus_main_window,
            open_floating_traffic_window
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
                // 开发模式：与 `make dev` / `dev:tauri-stack` 中的 `proxy-app` 共用 `frontend/.proxy-dev-ports.json`
                app.manage(system_proxy::SystemProxyRestoreState(Mutex::new(None)));
                if let Some(ports_path) = dev_workspace_proxy_ports_path() {
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        for _ in 0..600u32 {
                            if let Some((proxy_port, dashboard_port)) =
                                read_listen_ports_from_file(&ports_path)
                            {
                                let addr = SocketAddr::from(([127, 0, 0, 1], dashboard_port));
                                if std::net::TcpStream::connect(addr).is_ok() {
                                    if let Some(st) =
                                        handle.try_state::<system_proxy::SystemProxyRestoreState>()
                                    {
                                        if let Ok(mut guard) = st.0.lock() {
                                            *guard = system_proxy::apply_local_proxy(proxy_port);
                                        }
                                    }
                                    return;
                                }
                            }
                            std::thread::sleep(Duration::from_millis(50));
                        }
                    });
                }
                spawn_dev_navigate_main_to_vite(app.handle());
                return Ok(());
            }

            // Release: `beforeBuildCommand` has built the UI and `proxy-app` sidecar; we spawn it
            // and point the webview at the dashboard (same origin as `/api` + `ServeDir`).
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|e| anyhow::anyhow!("resource_dir: {e}"))?;
            let dist = resource_dir.join("dist");
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| anyhow::anyhow!("app_data_dir: {e}"))?;
            let _ = std::fs::create_dir_all(&data_dir);

            let (mut rx, child) = app
                .shell()
                .sidecar("proxy-app")
                .context("sidecar proxy-app")?
                .env("DASHBOARD_DIST", &dist)
                .env("PROXY_DATA_DIR", &data_dir)
                .env("MITM", "1")
                .spawn()
                .map_err(|e| anyhow::anyhow!("spawn proxy-app: {e}"))?;

            std::thread::spawn(move || {
                tauri::async_runtime::block_on(async { while rx.recv().await.is_some() {} });
            });

            app.manage(ProxySidecarChild(Mutex::new(Some(child))));
            app.manage(system_proxy::SystemProxyRestoreState(Mutex::new(None)));

            let ports_path = data_dir.join("listen-ports.json");
            let main = app
                .get_webview_window("main")
                .ok_or_else(|| anyhow::anyhow!("missing main webview window"))?;
            for i in 0..600u32 {
                if let Some((proxy_port, dashboard_port)) = read_listen_ports_from_file(&ports_path)
                {
                    let addr = SocketAddr::from(([127, 0, 0, 1], dashboard_port));
                    if std::net::TcpStream::connect(addr).is_ok() {
                        let url = format!("http://127.0.0.1:{dashboard_port}");
                        main.navigate(Url::parse(&url).map_err(|e| anyhow::anyhow!("url: {e}"))?)
                            .map_err(|e| anyhow::anyhow!("navigate: {e}"))?;
                        log::info!("dashboard at {url} (after {i} wait polls)");
                        if let Some(st) = app.try_state::<system_proxy::SystemProxyRestoreState>() {
                            if let Ok(mut guard) = st.0.lock() {
                                *guard = system_proxy::apply_local_proxy(proxy_port);
                            }
                        }
                        return Ok(());
                    }
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(anyhow::anyhow!(
                "timed out waiting for {} (proxy-app should write this after binding)",
                ports_path.display()
            )
            .into())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS Cmd+Q 等路径下可能先收到 ExitRequested 再收到 Exit；仅依赖 Exit 时偶发收不到恢复时机。
            let should_restore_system_proxy =
                matches!(&event, RunEvent::Exit | RunEvent::ExitRequested { .. });
            if should_restore_system_proxy {
                if let Some(proxy_state) = app.try_state::<system_proxy::SystemProxyRestoreState>()
                {
                    let saved = match proxy_state.0.lock() {
                        Ok(mut guard) => guard.take(),
                        Err(poisoned) => poisoned.into_inner().take(),
                    };
                    system_proxy::restore_saved_proxies(saved);
                }
            }
            if matches!(&event, RunEvent::Exit) {
                if let Some(sidecar) = app.try_state::<ProxySidecarChild>() {
                    let _ = sidecar.0.lock().map(|mut guard| {
                        if let Some(c) = guard.take() {
                            let _ = c.kill();
                        }
                    });
                }
            }
        });
}
