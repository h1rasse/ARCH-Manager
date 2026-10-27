use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct NetworkCapabilities {
    pub interfaces: Vec<NetworkInterface>,
    pub tcp: TcpCongestion,
}

#[derive(Debug, Serialize)]
pub struct NetworkInterface {
    pub name: String,
    pub path: String,
    pub operstate: Option<String>,
    pub carrier: Option<String>,
    pub mtu: Option<u64>,
    pub speed: Option<String>,
    pub duplex: Option<String>,
    pub address: Option<String>,
    pub tx_queue_len: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct TcpCongestion {
    pub current: Option<String>,
    pub available: Option<String>,
    pub allowed: Option<String>,
    pub current_path: String,
    pub writable: bool,
}

pub fn discover() -> NetworkCapabilities {
    NetworkCapabilities {
        interfaces: discover_interfaces(),
        tcp: discover_tcp(),
    }
}

pub fn capture_baseline() -> BTreeMap<String, String> {
    read_value(&congestion_path())
        .map(|value| {
            [(congestion_path().display().to_string(), value)]
                .into_iter()
                .collect()
        })
        .unwrap_or_default()
}

pub fn congestion_path() -> PathBuf {
    PathBuf::from("/proc/sys/net/ipv4/tcp_congestion_control")
}

pub fn validate_algorithm(algorithm: &str) -> Result<String, String> {
    if algorithm.is_empty()
        || !algorithm.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(format!("invalid TCP congestion algorithm: {algorithm}"));
    }
    let available = read_value(Path::new(
        "/proc/sys/net/ipv4/tcp_available_congestion_control",
    ))
    .unwrap_or_default();
    if !available.split_whitespace().any(|value| value == algorithm) {
        return Err(format!(
            "TCP congestion algorithm is unavailable: {algorithm}"
        ));
    }
    Ok(algorithm.to_string())
}

fn discover_interfaces() -> Vec<NetworkInterface> {
    entries(Path::new("/sys/class/net"))
        .into_iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_string_lossy().to_string();
            Some(NetworkInterface {
                name,
                path: path.display().to_string(),
                operstate: read_value(&path.join("operstate")),
                carrier: read_value(&path.join("carrier")),
                mtu: read_value(&path.join("mtu")).and_then(|value| value.parse().ok()),
                speed: read_value(&path.join("speed")),
                duplex: read_value(&path.join("duplex")),
                address: read_value(&path.join("address")),
                tx_queue_len: read_value(&path.join("tx_queue_len"))
                    .and_then(|value| value.parse().ok()),
            })
        })
        .collect()
}

fn discover_tcp() -> TcpCongestion {
    let path = congestion_path();
    TcpCongestion {
        current: read_value(&path),
        available: read_value(Path::new(
            "/proc/sys/net/ipv4/tcp_available_congestion_control",
        )),
        allowed: read_value(Path::new(
            "/proc/sys/net/ipv4/tcp_allowed_congestion_control",
        )),
        current_path: path.display().to_string(),
        writable: is_writable(&path),
    }
}

fn entries(path: &Path) -> Vec<PathBuf> {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok).map(|entry| entry.path()))
        .collect()
}

fn read_value(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
}

fn is_writable(path: &Path) -> bool {
    fs::OpenOptions::new().write(true).open(path).is_ok()
}
