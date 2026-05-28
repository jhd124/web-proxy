//! 应用启动时为本机代理端口打开系统 HTTP/HTTPS 代理，退出时按快照恢复。

mod network;

use std::panic;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

pub type SavedSystemProxies = network::SavedSystemProxies;
static LAST_APPLIED_PROXIES: Mutex<Option<SavedSystemProxies>> = Mutex::new(None);
static PANIC_HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);

/// 由 Tauri 托管：成功应用代理后写入快照，退出时 `restore_saved_proxies` 消费。
pub struct SystemProxyRestoreState(pub Mutex<Option<SavedSystemProxies>>);

pub fn apply_local_proxy(proxy_port: u16) -> Option<SavedSystemProxies> {
    let saved = network::apply_localhost_http_https_proxy(proxy_port);
    remember_saved_proxies(saved.clone());
    saved
}

pub fn reapply_local_proxy(proxy_port: u16, saved: &mut SavedSystemProxies) -> bool {
    network::reapply_localhost_http_https_proxy(proxy_port, saved)
}

pub fn restore_saved_proxies(saved: Option<SavedSystemProxies>) {
    if let Some(s) = saved {
        network::restore_http_https_proxy(&s);
    }
    remember_saved_proxies(None);
}

pub fn install_panic_restore_hook() {
    if PANIC_HOOK_INSTALLED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let previous_hook = panic::take_hook();
    panic::set_hook(Box::new(move |panic_info| {
        restore_from_last_snapshot();
        previous_hook(panic_info);
    }));
}

pub fn restore_from_last_snapshot() {
    let saved = take_saved_proxies();
    if let Some(s) = saved {
        log::warn!("system_proxy: panic path restore HTTP/HTTPS proxy");
        network::restore_http_https_proxy(&s);
    }
}

fn remember_saved_proxies(saved: Option<SavedSystemProxies>) {
    match LAST_APPLIED_PROXIES.lock() {
        Ok(mut guard) => *guard = saved,
        Err(poisoned) => {
            let mut guard = poisoned.into_inner();
            *guard = saved;
        }
    }
}

fn take_saved_proxies() -> Option<SavedSystemProxies> {
    match LAST_APPLIED_PROXIES.lock() {
        Ok(mut guard) => guard.take(),
        Err(poisoned) => {
            let mut guard = poisoned.into_inner();
            guard.take()
        }
    }
}
