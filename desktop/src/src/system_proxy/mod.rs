//! 应用启动时为本机代理端口打开系统 HTTP/HTTPS 代理，退出时按快照恢复。

mod network;

use std::sync::Mutex;

pub type SavedSystemProxies = network::SavedSystemProxies;

/// 由 Tauri 托管：成功应用代理后写入快照，退出时 `restore_saved_proxies` 消费。
pub struct SystemProxyRestoreState(pub Mutex<Option<SavedSystemProxies>>);

pub fn apply_local_proxy(proxy_port: u16) -> Option<SavedSystemProxies> {
    network::apply_localhost_http_https_proxy(proxy_port)
}

pub fn restore_saved_proxies(saved: Option<SavedSystemProxies>) {
    if let Some(s) = saved {
        network::restore_http_https_proxy(&s);
    }
}
