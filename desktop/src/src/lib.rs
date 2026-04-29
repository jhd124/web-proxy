mod mitm_install;

use std::sync::Mutex;
use std::time::Duration;

use anyhow::Context;
use tauri::Manager;
use tauri::RunEvent;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Holds the bundled `proxy-app` process so we can kill it on exit (release builds only).
pub struct ProxySidecarChild(pub Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            mitm_install::install_mitm_ca_system_trust,
            mitm_install::open_mitm_ca_file
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
                tauri::async_runtime::block_on(async {
                    while rx.recv().await.is_some() {}
                });
            });

            app.manage(ProxySidecarChild(Mutex::new(Some(child))));

            for i in 0..200u32 {
                if std::net::TcpStream::connect("127.0.0.1:9091").is_ok() {
                    log::info!("dashboard ready after {i} attempts");
                    return Ok(());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(anyhow::anyhow!("timed out waiting for proxy dashboard on 127.0.0.1:9091").into())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(sidecar) = app.try_state::<ProxySidecarChild>() {
                    if let Ok(mut guard) = sidecar.0.lock() {
                        if let Some(c) = guard.take() {
                            let _ = c.kill();
                        }
                    }
                }
            }
        });
}
