//! Proxyman-style MITM CA install: system keychain (macOS) with admin prompt, or open file.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Reject path injection: must be `.../mitm-ca/ca.pem` and exist.
fn validate_mitm_ca_path(ca_pem_path: &str) -> Result<PathBuf, String> {
    let p = Path::new(ca_pem_path);
    if !p.is_absolute() {
        return Err("path must be absolute".into());
    }
    if p.file_name().and_then(|n| n.to_str()) != Some("ca.pem") {
        return Err("expected a file named ca.pem".into());
    }
    match p.parent().and_then(|d| d.file_name()).and_then(|n| n.to_str()) {
        Some("mitm-ca") => {}
        _ => return Err("expected .../mitm-ca/ca.pem".into()),
    }
    if !p.is_file() {
        return Err("CA file not found (start proxy with MITM=1 and wait for the CA to be created)".into());
    }
    Ok(p.to_path_buf())
}

/// macOS: add root trust like Proxyman — `security add-trusted-cert` to system keychain via `osascript`
/// (prompts for administrator password).
#[cfg(target_os = "macos")]
fn install_trusted_root_macos(path: &Path) -> Result<(), String> {
    let path_str = path
        .to_str()
        .ok_or("path is not valid UTF-8 (required for cert install)")?;
    // Same shell shape as Proxyman / Apple docs: trustRoot in System keychain.
    const SCRIPT: &str = "on run argv
set p to item 1 of argv
do shell script \"security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \" & quoted form of p with administrator privileges
end run";
    let out = Command::new("osascript")
        .arg("-e")
        .arg(SCRIPT)
        .arg("--")
        .arg(path_str)
        .output()
        .map_err(|e| format!("osascript: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr);
    let out = String::from_utf8_lossy(&out.stdout);
    Err(format!(
        "install failed (user cancelled or not allowed):\n{err}{out}"
    ))
}

#[cfg(not(target_os = "macos"))]
fn install_trusted_root_macos(_path: &Path) -> Result<(), String> {
    Err("system trust install is only implemented on macOS. Use the download link and install manually, or add support for this OS.".into())
}

/// Open the PEM in the default handler (macOS: Keychain import / preview flow).
fn open_cert_file(path: &Path) -> Result<(), String> {
    let path_str = path
        .to_str()
        .ok_or("path is not valid UTF-8")?;
    #[cfg(target_os = "macos")]
    {
        let s = Command::new("open")
            .arg(path_str)
            .status()
            .map_err(|e| format!("open: {e}"))?;
        return if s.success() {
            Ok(())
        } else {
            Err("open: command failed".into())
        };
    }
    #[cfg(target_os = "windows")]
    {
        // No quotes in the path for Explorer — use raw arg.
        let s = Command::new("cmd")
            .args(["/C", "start", "", path_str])
            .status()
            .map_err(|e| format!("start: {e}"))?;
        return if s.success() {
            Ok(())
        } else {
            Err("open: command failed".into())
        };
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let s = Command::new("xdg-open")
            .arg(path_str)
            .status()
            .map_err(|e| format!("xdg-open: {e}"))?;
        if s.success() {
            Ok(())
        } else {
            Err("open: command failed".into())
        }
    }
}

#[tauri::command]
pub fn install_mitm_ca_system_trust(ca_pem_path: String) -> Result<(), String> {
    let p = validate_mitm_ca_path(&ca_pem_path)?;
    install_trusted_root_macos(&p)
}

#[tauri::command]
pub fn open_mitm_ca_file(ca_pem_path: String) -> Result<(), String> {
    let p = validate_mitm_ca_path(&ca_pem_path)?;
    open_cert_file(&p)
}
