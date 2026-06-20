//! macOS：`networksetup` 读写 Web 代理。

use std::process::Command;

use super::{SavedSystemProxies, ServiceProxySnapshot, APPLY_LOCK};

pub fn apply_macos(proxy_port: u16) -> Option<SavedSystemProxies> {
    let _guard = APPLY_LOCK.lock().ok()?;
    let services = enabled_network_services();
    if services.is_empty() {
        tracing::warn!("system_proxy: no enabled network service found");
        return None;
    }
    let mut snapshots = Vec::new();
    for service in &services {
        let current = match read_service_proxy_snapshot(service) {
            Some(s) => s,
            None => {
                for rollback in &snapshots {
                    restore_service_snapshot(rollback);
                }
                tracing::warn!("system_proxy: failed to read proxy snapshot on {service}");
                return None;
            }
        };
        let baseline = restore_baseline_for_localhost_proxy(&current, proxy_port);
        if !set_localhost_proxy_on_service(service, proxy_port, &baseline) {
            for rollback in &snapshots {
                restore_service_snapshot(rollback);
            }
            tracing::warn!("system_proxy: failed to enable proxy on {service}");
            return None;
        }
        snapshots.push(baseline);
    }
    tracing::info!(
        "system_proxy: HTTP/HTTPS proxy enabled on {} services -> 127.0.0.1:{proxy_port}",
        snapshots.len()
    );
    Some(SavedSystemProxies { snapshots })
}

/// 网络变化（例如 VPN 上下线）后，对当前启用服务重新应用代理；
/// 新出现的服务会被增量写入 `saved`，确保退出时仍可恢复到初始状态。
pub fn reapply_macos_with_saved(proxy_port: u16, saved: &mut SavedSystemProxies) -> bool {
    let _guard = match APPLY_LOCK.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    let services = enabled_network_services();
    if services.is_empty() {
        return false;
    }
    let mut applied = 0usize;
    for service in services {
        let Some(current) = read_service_proxy_snapshot(&service) else {
            tracing::warn!(
                "system_proxy: skip reapply, cannot read current proxy state on {service}"
            );
            continue;
        };
        if snapshot_points_to_localhost(&current, proxy_port) {
            continue;
        }
        let baseline = if let Some(existing) = saved
            .snapshots
            .iter()
            .find(|s| s.service_name == service)
            .cloned()
        {
            existing
        } else {
            let baseline = restore_baseline_for_localhost_proxy(&current, proxy_port);
            saved.snapshots.push(baseline.clone());
            baseline
        };
        if !set_localhost_proxy_on_service(&service, proxy_port, &baseline) {
            tracing::warn!("system_proxy: skip reapply, cannot set proxy on {service}");
            continue;
        }
        applied += 1;
    }
    if applied > 0 {
        tracing::info!(
            "system_proxy: reapplied HTTP/HTTPS proxy on {} services",
            applied
        );
        return true;
    }
    false
}

pub fn restore_macos(saved: &SavedSystemProxies) {
    let _guard = match APPLY_LOCK.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    for snap in &saved.snapshots {
        restore_service_snapshot(snap);
    }
}

pub fn disable_macos_localhost_proxy(proxy_port: u16) {
    let _guard = match APPLY_LOCK.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    for service in enabled_network_services() {
        let Some(current) = read_service_proxy_snapshot(&service) else {
            tracing::warn!(
                "system_proxy: skip disable, cannot read current proxy state on {service}"
            );
            continue;
        };
        let mut disabled = false;
        if current.http_enabled
            && current.http_server == "127.0.0.1"
            && current.http_port == proxy_port
        {
            let _ = Command::new("networksetup")
                .args(["-setwebproxystate", &service, "off"])
                .status();
            disabled = true;
        }
        if current.https_enabled
            && current.https_server == "127.0.0.1"
            && current.https_port == proxy_port
        {
            let _ = Command::new("networksetup")
                .args(["-setsecurewebproxystate", &service, "off"])
                .status();
            disabled = true;
        }
        if disabled {
            tracing::info!("system_proxy: disabled localhost HTTP/HTTPS proxy for \"{service}\"");
        }
    }
}

fn run_networksetup(args: &[&str]) -> Option<String> {
    let output = Command::new("networksetup").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

fn enabled_network_services() -> Vec<String> {
    let Some(text) = run_networksetup(&["-listallnetworkservices"]) else {
        return Vec::new();
    };
    text.lines()
        .skip(1)
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('*'))
        .map(ToString::to_string)
        .collect()
}

fn parse_proxy_block(text: &str) -> Option<(bool, String, u16)> {
    let mut enabled = false;
    let mut server = String::new();
    let mut port: u16 = 0;
    for line in text.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("Enabled:") {
            enabled = v.trim().eq_ignore_ascii_case("Yes");
        } else if let Some(v) = line.strip_prefix("Server:") {
            server = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("Port:") {
            port = v.trim().parse().unwrap_or(0);
        }
    }
    Some((enabled, server, port))
}

fn snapshot_points_to_localhost(snap: &ServiceProxySnapshot, proxy_port: u16) -> bool {
    let http_ok =
        snap.http_enabled && snap.http_server == "127.0.0.1" && snap.http_port == proxy_port;
    let https_ok =
        snap.https_enabled && snap.https_server == "127.0.0.1" && snap.https_port == proxy_port;
    http_ok && https_ok
}

fn restore_baseline_for_localhost_proxy(
    current: &ServiceProxySnapshot,
    proxy_port: u16,
) -> ServiceProxySnapshot {
    let mut baseline = current.clone();
    if current.http_enabled && current.http_server == "127.0.0.1" && current.http_port == proxy_port
    {
        baseline.http_enabled = false;
    }
    if current.https_enabled
        && current.https_server == "127.0.0.1"
        && current.https_port == proxy_port
    {
        baseline.https_enabled = false;
    }
    baseline
}

fn read_service_proxy_snapshot(service: &str) -> Option<ServiceProxySnapshot> {
    let http_text = run_networksetup(&["-getwebproxy", service])?;
    let https_text = run_networksetup(&["-getsecurewebproxy", service])?;
    let (http_enabled, http_server, http_port) = parse_proxy_block(&http_text)?;
    let (https_enabled, https_server, https_port) = parse_proxy_block(&https_text)?;
    Some(ServiceProxySnapshot {
        service_name: service.to_string(),
        http_enabled,
        http_server,
        http_port,
        https_enabled,
        https_server,
        https_port,
    })
}

fn set_localhost_proxy_on_service(
    service: &str,
    proxy_port: u16,
    rollback: &ServiceProxySnapshot,
) -> bool {
    let port_str = proxy_port.to_string();
    let ok_http = Command::new("networksetup")
        .args(["-setwebproxy", service, "127.0.0.1", &port_str])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
        && Command::new("networksetup")
            .args(["-setwebproxystate", service, "on"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
    let ok_https = Command::new("networksetup")
        .args(["-setsecurewebproxy", service, "127.0.0.1", &port_str])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
        && Command::new("networksetup")
            .args(["-setsecurewebproxystate", service, "on"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
    if ok_http && ok_https {
        return true;
    }
    restore_service_snapshot(rollback);
    false
}

fn restore_service_snapshot(snap: &ServiceProxySnapshot) {
    let s = snap.service_name.as_str();
    if snap.http_enabled {
        let port_str = snap.http_port.to_string();
        let _ = Command::new("networksetup")
            .args(["-setwebproxy", s, &snap.http_server, &port_str])
            .status();
        let _ = Command::new("networksetup")
            .args(["-setwebproxystate", s, "on"])
            .status();
    } else {
        let _ = Command::new("networksetup")
            .args(["-setwebproxystate", s, "off"])
            .status();
    }
    if snap.https_enabled {
        let port_str = snap.https_port.to_string();
        let _ = Command::new("networksetup")
            .args(["-setsecurewebproxy", s, &snap.https_server, &port_str])
            .status();
        let _ = Command::new("networksetup")
            .args(["-setsecurewebproxystate", s, "on"])
            .status();
    } else {
        let _ = Command::new("networksetup")
            .args(["-setsecurewebproxystate", s, "off"])
            .status();
    }
    tracing::info!("system_proxy: restored Web proxy state for \"{s}\"");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_baseline_disables_stale_localhost_proxy() {
        let current = ServiceProxySnapshot {
            service_name: "Wi-Fi".to_string(),
            http_enabled: true,
            http_server: "127.0.0.1".to_string(),
            http_port: 9090,
            https_enabled: true,
            https_server: "127.0.0.1".to_string(),
            https_port: 9090,
        };

        let baseline = restore_baseline_for_localhost_proxy(&current, 9090);

        assert!(!baseline.http_enabled);
        assert!(!baseline.https_enabled);
        assert_eq!(baseline.http_server, "127.0.0.1");
        assert_eq!(baseline.https_server, "127.0.0.1");
    }

    #[test]
    fn restore_baseline_preserves_user_proxy_on_other_port() {
        let current = ServiceProxySnapshot {
            service_name: "Wi-Fi".to_string(),
            http_enabled: true,
            http_server: "127.0.0.1".to_string(),
            http_port: 8888,
            https_enabled: true,
            https_server: "proxy.example".to_string(),
            https_port: 443,
        };

        let baseline = restore_baseline_for_localhost_proxy(&current, 9090);

        assert!(baseline.http_enabled);
        assert!(baseline.https_enabled);
        assert_eq!(baseline.http_port, 8888);
        assert_eq!(baseline.https_server, "proxy.example");
    }
}
