//! macOS：`networksetup` 读写 Web 代理。

use std::process::Command;

use super::{SavedSystemProxies, ServiceProxySnapshot, APPLY_LOCK};

pub fn apply_macos(proxy_port: u16) -> Option<SavedSystemProxies> {
    let _guard = APPLY_LOCK.lock().ok()?;
    let service = primary_network_service_name()?;
    let snap = read_service_proxy_snapshot(&service)?;
    if !set_localhost_proxy_on_service(&service, proxy_port, &snap) {
        log::warn!("system_proxy: failed to enable proxy on {service}");
        return None;
    }
    log::info!(
        "system_proxy: HTTP/HTTPS proxy enabled on \"{service}\" -> 127.0.0.1:{proxy_port}"
    );
    Some(SavedSystemProxies {
        snapshots: vec![snap],
    })
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

fn run_networksetup(args: &[&str]) -> Option<String> {
    let output = Command::new("networksetup").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

fn default_route_interface() -> Option<String> {
    let output = Command::new("route")
        .args(["-n", "get", "default"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("interface:") {
            let iface = rest.trim();
            if !iface.is_empty() {
                return Some(iface.to_string());
            }
        }
    }
    None
}

fn service_name_for_device(device: &str) -> Option<String> {
    let text = run_networksetup(&["-listallhardwareports"])?;
    let mut pending_port_name: Option<String> = None;
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if let Some(name) = line.strip_prefix("Hardware Port:") {
            pending_port_name = Some(name.trim().to_string());
            continue;
        }
        if let Some(dev) = line.strip_prefix("Device:") {
            let dev = dev.trim();
            if dev == device {
                return pending_port_name.take();
            }
            pending_port_name = None;
        }
    }
    None
}

fn first_enabled_network_service() -> Option<String> {
    let text = Command::new("networksetup")
        .arg("-listallnetworkservices")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())?;
    let mut lines = text.lines();
    let _ = lines.next();
    for line in lines {
        let line = line.trim();
        if line.is_empty() || line.starts_with('*') {
            continue;
        }
        return Some(line.to_string());
    }
    None
}

/// 优先默认路由网卡对应服务；utun/ipsec 回退到第一个已启用服务。
fn primary_network_service_name() -> Option<String> {
    if let Some(iface) = default_route_interface() {
        if iface.starts_with("utun") || iface.starts_with("ipsec") {
            return first_enabled_network_service();
        }
        if let Some(name) = service_name_for_device(&iface) {
            return Some(name);
        }
    }
    first_enabled_network_service()
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
    log::info!("system_proxy: restored Web proxy state for \"{s}\"");
}
