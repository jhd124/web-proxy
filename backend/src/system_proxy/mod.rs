//! 应用运行期间按需打开系统 HTTP/HTTPS 代理，关闭或退出时按快照恢复。

mod network;

use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Mutex;
use std::time::Duration;

pub type SavedSystemProxies = network::SavedSystemProxies;

const REAPPLY_INTERVAL_MS: u64 = 2_000;

static LAST_APPLIED_PROXIES: Mutex<Option<SavedSystemProxies>> = Mutex::new(None);
static REAPPLY_WATCHER_STARTED: AtomicBool = AtomicBool::new(false);
static REAPPLY_PROXY_PORT: AtomicU16 = AtomicU16::new(0);

pub fn enable_http_https_proxy(proxy_port: u16) -> bool {
    if proxy_port == 0 {
        return false;
    }
    if REAPPLY_PROXY_PORT.load(Ordering::SeqCst) == proxy_port && has_saved_proxies() {
        return true;
    }
    let Some(saved) = network::apply_localhost_http_https_proxy(proxy_port) else {
        return false;
    };
    remember_saved_proxies(Some(saved));
    REAPPLY_PROXY_PORT.store(proxy_port, Ordering::SeqCst);
    spawn_reapply_watcher();
    true
}

pub fn disable_http_https_proxy(proxy_port: u16) {
    REAPPLY_PROXY_PORT.store(0, Ordering::SeqCst);
    if let Some(saved) = take_saved_proxies() {
        restore_saved_proxies(saved);
        return;
    }
    if proxy_port > 0 {
        network::disable_localhost_http_https_proxy(proxy_port);
    }
}

pub fn restore_from_last_snapshot() {
    REAPPLY_PROXY_PORT.store(0, Ordering::SeqCst);
    if let Some(saved) = take_saved_proxies() {
        restore_saved_proxies(saved);
    }
}

fn spawn_reapply_watcher() {
    if REAPPLY_WATCHER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    std::thread::spawn(|| loop {
        std::thread::sleep(Duration::from_millis(REAPPLY_INTERVAL_MS));
        let proxy_port = REAPPLY_PROXY_PORT.load(Ordering::SeqCst);
        if proxy_port == 0 {
            continue;
        }
        let mut guard = match LAST_APPLIED_PROXIES.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        let Some(saved) = guard.as_mut() else {
            continue;
        };
        let _ = network::reapply_localhost_http_https_proxy(proxy_port, saved);
    });
}

fn restore_saved_proxies(saved: SavedSystemProxies) {
    network::restore_http_https_proxy(&saved);
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

fn has_saved_proxies() -> bool {
    match LAST_APPLIED_PROXIES.lock() {
        Ok(guard) => guard.is_some(),
        Err(poisoned) => poisoned.into_inner().is_some(),
    }
}
