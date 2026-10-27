use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct CpuCore {
    pub cpu: u32,
    pub path: String,
    pub online: bool,
    pub online_node: Option<String>,
    pub writable: bool,
}

pub fn discover() -> Vec<CpuCore> {
    let root = Path::new("/sys/devices/system/cpu");
    entries(root)
        .into_iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_string_lossy();
            let cpu = name.strip_prefix("cpu")?.parse().ok()?;
            let online_path = path.join("online");
            Some(CpuCore {
                cpu,
                path: path.display().to_string(),
                online: read_value(&online_path)
                    .and_then(|value| value.parse::<u8>().ok())
                    .map(|value| value != 0)
                    .unwrap_or(true),
                online_node: online_path
                    .is_file()
                    .then(|| online_path.display().to_string()),
                writable: online_path.is_file() && is_writable(&online_path),
            })
        })
        .collect()
}

pub fn resolve_online_path(cpu: &str) -> Result<PathBuf, String> {
    let number = cpu
        .strip_prefix("cpu")
        .unwrap_or(cpu)
        .parse::<u32>()
        .map_err(|_| format!("invalid CPU core: {cpu}"))?;
    let path = PathBuf::from(format!("/sys/devices/system/cpu/cpu{number}/online"));
    if number == 0 || !path.is_file() {
        return Err(format!(
            "CPU core does not expose a writable online node: cpu{number}"
        ));
    }
    Ok(path)
}

pub fn capture_baseline() -> BTreeMap<String, String> {
    discover()
        .into_iter()
        .filter(|core| core.writable)
        .filter_map(|core| {
            let value = if core.online { "1" } else { "0" }.to_string();
            core.online_node.map(|path| (path, value))
        })
        .collect()
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
