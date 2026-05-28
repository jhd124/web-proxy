//! 按启用网络服务读写系统 HTTP/HTTPS 代理（macOS：`networksetup`）。

use std::sync::Mutex;

/// 退出应用时用于恢复某一网络服务上的 Web 代理状态。
#[derive(Debug, Clone)]
pub struct ServiceProxySnapshot {
    pub service_name: String,
    pub http_enabled: bool,
    pub http_server: String,
    pub http_port: u16,
    pub https_enabled: bool,
    pub https_server: String,
    pub https_port: u16,
}

#[derive(Debug, Clone)]
pub struct SavedSystemProxies {
    pub snapshots: Vec<ServiceProxySnapshot>,
}

pub(super) static APPLY_LOCK: Mutex<()> = Mutex::new(());

/// 在「当前」网络服务上启用本机 HTTP/HTTPS 代理；返回应用前的快照供退出时恢复。
pub fn apply_localhost_http_https_proxy(proxy_port: u16) -> Option<SavedSystemProxies> {
    #[cfg(target_os = "macos")]
    {
        return macos::apply_macos(proxy_port);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = proxy_port;
        None
    }
}

/// 网络变化后重应用本机代理，并增量补全恢复快照。
pub fn reapply_localhost_http_https_proxy(proxy_port: u16, saved: &mut SavedSystemProxies) -> bool {
    #[cfg(target_os = "macos")]
    {
        return macos::reapply_macos_with_saved(proxy_port, saved);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = proxy_port;
        let _ = saved;
        false
    }
}

pub fn restore_http_https_proxy(saved: &SavedSystemProxies) {
    #[cfg(target_os = "macos")]
    {
        macos::restore_macos(saved);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = saved;
    }
}

#[cfg(target_os = "macos")]
mod macos;
