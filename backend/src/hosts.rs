use crate::state::AppState;
use anyhow::{bail, Context};
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use uuid::Uuid;

const START_MARKER: &str = "# >>> proxy-app managed hosts >>>";
const END_MARKER: &str = "# <<< proxy-app managed hosts <<<";
const CONFIG_FILE_NAME: &str = "proxy-hosts.json";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedHostEntry {
    pub address: String,
    pub hostname: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub comment: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostsConfig {
    #[serde(default)]
    pub entries: Vec<ManagedHostEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostsResponse {
    pub entries: Vec<ManagedHostEntry>,
    pub system_path: String,
    pub platform: String,
    pub managed_block_present: bool,
    pub applied: bool,
    pub write_requires_elevation: bool,
}

pub async fn list_hosts(
    State(state): State<Arc<AppState>>,
) -> Result<Json<HostsResponse>, (StatusCode, String)> {
    hosts_response(&state).map(Json).map_err(internal_error)
}

pub async fn update_hosts(
    State(state): State<Arc<AppState>>,
    Json(config): Json<HostsConfig>,
) -> Result<Json<HostsResponse>, (StatusCode, String)> {
    let config = sanitize_config(config).map_err(bad_request)?;
    save_config(config_path(&state.override_db_path), &config).map_err(internal_error)?;
    hosts_response(&state).map(Json).map_err(internal_error)
}

pub async fn apply_hosts(
    State(state): State<Arc<AppState>>,
) -> Result<Json<HostsResponse>, (StatusCode, String)> {
    let config = load_config(&config_path(&state.override_db_path)).map_err(internal_error)?;
    let path = system_hosts_path();
    let current = read_system_hosts(&path).map_err(internal_error)?;
    write_system_hosts(&path, &apply_content(&current, &config)).map_err(internal_error)?;
    hosts_response(&state).map(Json).map_err(internal_error)
}

pub async fn revert_hosts(
    State(state): State<Arc<AppState>>,
) -> Result<Json<HostsResponse>, (StatusCode, String)> {
    let path = system_hosts_path();
    let current = read_system_hosts(&path).map_err(internal_error)?;
    write_system_hosts(&path, &remove_managed_block(&current)).map_err(internal_error)?;
    hosts_response(&state).map(Json).map_err(internal_error)
}

pub fn config_path(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .map(|parent| parent.join(CONFIG_FILE_NAME))
        .unwrap_or_else(|| PathBuf::from(CONFIG_FILE_NAME))
}

fn hosts_response(state: &AppState) -> anyhow::Result<HostsResponse> {
    let config = load_config(&config_path(&state.override_db_path))?;
    let path = system_hosts_path();
    let current = read_system_hosts(&path).unwrap_or_default();
    let expected = apply_content(&current, &config);
    Ok(HostsResponse {
        entries: config.entries,
        system_path: path.to_string_lossy().into_owned(),
        platform: std::env::consts::OS.to_string(),
        managed_block_present: has_managed_block(&current),
        applied: current == expected,
        write_requires_elevation: true,
    })
}

fn load_config(path: &Path) -> anyhow::Result<HostsConfig> {
    if !path.exists() {
        return load_config_from_system_hosts();
    }
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("read hosts config {}", path.display()))?;
    sanitize_config(serde_json::from_str(&raw).context("parse hosts config")?)
}

fn load_config_from_system_hosts() -> anyhow::Result<HostsConfig> {
    let path = system_hosts_path();
    let current = read_system_hosts(&path).unwrap_or_default();
    Ok(parse_managed_block(&current).unwrap_or_default())
}

fn save_config(path: PathBuf, config: &HostsConfig) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create hosts config dir {}", parent.display()))?;
    }
    let body = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, format!("{body}\n"))
        .with_context(|| format!("write hosts config {}", path.display()))
}

fn sanitize_config(config: HostsConfig) -> anyhow::Result<HostsConfig> {
    let mut entries = Vec::with_capacity(config.entries.len());
    for entry in config.entries {
        let address = entry.address.trim().to_string();
        let hostname = entry.hostname.trim().to_ascii_lowercase();
        let comment = entry.comment.trim().to_string();
        validate_entry(&address, &hostname, &comment)?;
        if entries
            .iter()
            .any(|existing: &ManagedHostEntry| existing.hostname == hostname)
        {
            bail!("duplicate hostname: {hostname}");
        }
        entries.push(ManagedHostEntry {
            address,
            hostname,
            enabled: entry.enabled,
            comment,
        });
    }
    Ok(HostsConfig { entries })
}

fn validate_entry(address: &str, hostname: &str, comment: &str) -> anyhow::Result<()> {
    if address.parse::<IpAddr>().is_err() {
        bail!("invalid IP address: {address}");
    }
    if hostname.is_empty() || hostname.len() > 253 {
        bail!("hostname is required");
    }
    if hostname.contains(char::is_whitespace) || hostname.contains('#') {
        bail!("hostname must not contain whitespace or #");
    }
    if hostname == "localhost" {
        bail!("localhost is managed by the operating system");
    }
    for label in hostname.split('.') {
        if label.is_empty() || label.len() > 63 {
            bail!("invalid hostname label: {hostname}");
        }
        let valid = label
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !valid || label.starts_with('-') || label.ends_with('-') {
            bail!("invalid hostname: {hostname}");
        }
    }
    if comment.contains('\n') || comment.contains('\r') {
        bail!("comment must be a single line");
    }
    Ok(())
}

fn read_system_hosts(path: &Path) -> anyhow::Result<String> {
    std::fs::read_to_string(path).with_context(|| format!("read hosts file {}", path.display()))
}

fn write_system_hosts(path: &Path, content: &str) -> anyhow::Result<()> {
    match std::fs::write(path, content) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            write_system_hosts_with_elevation(path, content).with_context(|| {
                format!(
                    "write hosts file {} with elevated permission after direct write was denied",
                    path.display()
                )
            })
        }
        Err(error) => Err(error).with_context(|| format!("write hosts file {}", path.display())),
    }
}

fn write_system_hosts_with_elevation(path: &Path, content: &str) -> anyhow::Result<()> {
    let temp_path = write_temp_hosts_content(content)?;
    let result = run_elevated_hosts_copy(&temp_path, path);
    let _ = std::fs::remove_file(&temp_path);
    #[cfg(windows)]
    {
        let _ = std::fs::remove_file(temp_path.with_extension("ps1"));
    }
    result
}

fn write_temp_hosts_content(content: &str) -> anyhow::Result<PathBuf> {
    let path = std::env::temp_dir().join(format!("proxy-hosts-{}.tmp", Uuid::new_v4()));
    std::fs::write(&path, content)
        .with_context(|| format!("write temp hosts {}", path.display()))?;
    Ok(path)
}

#[cfg(target_os = "macos")]
fn run_elevated_hosts_copy(source: &Path, target: &Path) -> anyhow::Result<()> {
    let script = [
        "on run argv",
        "set src to item 1 of argv",
        "set dst to item 2 of argv",
        "do shell script \"cat \" & quoted form of src & \" > \" & quoted form of dst with administrator privileges",
        "end run",
    ]
    .join("\n");
    let output = Command::new("osascript")
        .args(["-e", script.as_str(), "--"])
        .arg(source)
        .arg(target)
        .output()
        .context("run osascript for hosts write")?;
    ensure_command_success("osascript", output)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn run_elevated_hosts_copy(source: &Path, target: &Path) -> anyhow::Result<()> {
    let output = Command::new("pkexec")
        .args(["sh", "-c", "cat \"$1\" > \"$2\"", "sh"])
        .arg(source)
        .arg(target)
        .output()
        .context("run pkexec for hosts write")?;
    ensure_command_success("pkexec", output)
}

#[cfg(windows)]
fn run_elevated_hosts_copy(source: &Path, target: &Path) -> anyhow::Result<()> {
    let script_path = source.with_extension("ps1");
    let script = [
        "$ErrorActionPreference = \"Stop\"",
        "param([string]$Source, [string]$Target)",
        "Copy-Item -LiteralPath $Source -Destination $Target -Force",
    ]
    .join("\n");
    std::fs::write(&script_path, script)
        .with_context(|| format!("write elevated hosts script {}", script_path.display()))?;
    let command = format!(
        "$p = Start-Process -FilePath powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','{}','{}','{}') -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
        powershell_single_quote(&script_path.to_string_lossy()),
        powershell_single_quote(&source.to_string_lossy()),
        powershell_single_quote(&target.to_string_lossy()),
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"])
        .arg(command)
        .output()
        .context("run elevated powershell for hosts write")?;
    ensure_command_success("powershell", output)
}

#[cfg(windows)]
fn powershell_single_quote(value: &str) -> String {
    value.replace('\'', "''")
}

fn ensure_command_success(command: &str, output: std::process::Output) -> anyhow::Result<()> {
    if output.status.success() {
        return Ok(());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    bail!(
        "{command} exited with status {}: {}{}",
        output.status,
        stderr,
        stdout
    )
}

fn system_hosts_path() -> PathBuf {
    #[cfg(windows)]
    {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        return PathBuf::from(root).join("System32\\drivers\\etc\\hosts");
    }
    #[cfg(not(windows))]
    {
        PathBuf::from("/etc/hosts")
    }
}

fn apply_content(current: &str, config: &HostsConfig) -> String {
    if config.entries.is_empty() {
        return remove_managed_block(current);
    }
    replace_managed_block(current, &render_managed_block(config))
}

fn render_managed_block(config: &HostsConfig) -> String {
    let mut lines = vec![START_MARKER.to_string()];
    for entry in &config.entries {
        let suffix = if entry.comment.is_empty() {
            String::new()
        } else {
            format!(" # {}", entry.comment)
        };
        if entry.enabled {
            lines.push(format!("{}\t{}{}", entry.address, entry.hostname, suffix));
        } else {
            lines.push(format!(
                "# {}\t{}{} # disabled",
                entry.address, entry.hostname, suffix
            ));
        }
    }
    lines.push(END_MARKER.to_string());
    lines.join("\n")
}

fn parse_managed_block(current: &str) -> Option<HostsConfig> {
    let mut entries = Vec::new();
    let mut in_block = false;
    for line in current.lines() {
        let trimmed = line.trim();
        if trimmed == START_MARKER {
            in_block = true;
            continue;
        }
        if in_block && trimmed == END_MARKER {
            return sanitize_config(HostsConfig { entries }).ok();
        }
        if !in_block {
            continue;
        }
        if let Some(entry) = parse_managed_entry_line(line) {
            entries.push(entry);
        }
    }
    None
}

fn parse_managed_entry_line(line: &str) -> Option<ManagedHostEntry> {
    let raw = line.trim();
    if raw.is_empty() {
        return None;
    }

    let (enabled, body) = raw
        .strip_prefix('#')
        .map(|commented| (false, commented.trim()))
        .unwrap_or((true, raw));
    if body.is_empty() || body.starts_with('#') {
        return None;
    }

    let (fields_part, comment_part) = body.split_once('#').unwrap_or((body, ""));
    let fields: Vec<&str> = fields_part.split_whitespace().collect();
    if fields.len() < 2 {
        return None;
    }

    let raw_comment = comment_part.trim();
    let comment = if !enabled && raw_comment == "disabled" {
        String::new()
    } else {
        raw_comment
            .strip_suffix(" # disabled")
            .unwrap_or(raw_comment)
            .trim()
            .to_string()
    };
    Some(ManagedHostEntry {
        address: fields[0].to_string(),
        hostname: fields[1].to_string(),
        enabled,
        comment,
    })
}

fn replace_managed_block(current: &str, block: &str) -> String {
    let without = remove_managed_block(current);
    let trimmed = without.trim_end_matches(['\n', '\r']);
    if trimmed.is_empty() {
        format!("{block}\n")
    } else {
        format!("{trimmed}\n\n{block}\n")
    }
}

fn remove_managed_block(current: &str) -> String {
    let mut output = Vec::new();
    let mut in_block = false;
    for line in current.lines() {
        if line.trim() == START_MARKER {
            in_block = true;
            continue;
        }
        if in_block && line.trim() == END_MARKER {
            in_block = false;
            continue;
        }
        if !in_block {
            output.push(line);
        }
    }
    let mut body = output.join("\n");
    while body.contains("\n\n\n") {
        body = body.replace("\n\n\n", "\n\n");
    }
    if current.ends_with('\n') && !body.ends_with('\n') {
        body.push('\n');
    }
    body
}

fn has_managed_block(current: &str) -> bool {
    current.lines().any(|line| line.trim() == START_MARKER)
        && current.lines().any(|line| line.trim() == END_MARKER)
}

fn bad_request(error: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

fn internal_error(error: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_managed_block_preserves_user_lines() {
        let config = HostsConfig {
            entries: vec![ManagedHostEntry {
                address: "127.0.0.1".to_string(),
                hostname: "api.test.local".to_string(),
                enabled: true,
                comment: "mock api".to_string(),
            }],
        };

        let current = "127.0.0.1 localhost\n";
        let next = apply_content(current, &config);

        assert!(next.contains("127.0.0.1 localhost"));
        assert!(next.contains(START_MARKER));
        assert!(next.contains("127.0.0.1\tapi.test.local # mock api"));
    }

    #[test]
    fn replace_managed_block_replaces_existing_block() {
        let config = HostsConfig {
            entries: vec![ManagedHostEntry {
                address: "0.0.0.0".to_string(),
                hostname: "ads.test.local".to_string(),
                enabled: true,
                comment: String::new(),
            }],
        };

        let current =
            format!("127.0.0.1 localhost\n\n{START_MARKER}\n127.0.0.1\told.test\n{END_MARKER}\n");
        let next = apply_content(&current, &config);

        assert!(!next.contains("old.test"));
        assert!(next.contains("0.0.0.0\tads.test.local"));
    }

    #[test]
    fn parse_managed_block_restores_config_after_reinstall() {
        let current = format!(
            "127.0.0.1 localhost\n\n{START_MARKER}\n127.0.0.1\tapi.test.local # mock api\n# 0.0.0.0\tads.test.local # blocked ads # disabled\n# 127.0.0.2\tunused.test.local # disabled\n{END_MARKER}\n"
        );

        let config = parse_managed_block(&current).expect("managed block should parse");

        assert_eq!(
            config.entries,
            vec![
                ManagedHostEntry {
                    address: "127.0.0.1".to_string(),
                    hostname: "api.test.local".to_string(),
                    enabled: true,
                    comment: "mock api".to_string(),
                },
                ManagedHostEntry {
                    address: "0.0.0.0".to_string(),
                    hostname: "ads.test.local".to_string(),
                    enabled: false,
                    comment: "blocked ads".to_string(),
                },
                ManagedHostEntry {
                    address: "127.0.0.2".to_string(),
                    hostname: "unused.test.local".to_string(),
                    enabled: false,
                    comment: String::new(),
                },
            ]
        );
    }

    #[test]
    fn sanitize_config_rejects_duplicates_and_bad_hosts() {
        let duplicate = HostsConfig {
            entries: vec![
                ManagedHostEntry {
                    address: "127.0.0.1".to_string(),
                    hostname: "api.test".to_string(),
                    enabled: true,
                    comment: String::new(),
                },
                ManagedHostEntry {
                    address: "127.0.0.2".to_string(),
                    hostname: "API.TEST".to_string(),
                    enabled: true,
                    comment: String::new(),
                },
            ],
        };
        assert!(sanitize_config(duplicate).is_err());

        let bad = HostsConfig {
            entries: vec![ManagedHostEntry {
                address: "127.0.0.1".to_string(),
                hostname: "bad host".to_string(),
                enabled: true,
                comment: String::new(),
            }],
        };
        assert!(sanitize_config(bad).is_err());
    }
}
