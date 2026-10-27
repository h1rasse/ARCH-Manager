use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const GROUPS: &[&str] = &[
    "top-app",
    "foreground",
    "background",
    "system-background",
    "restricted",
];

#[derive(Debug, Serialize)]
pub struct SchedulerCapabilities {
    pub uclamp: Vec<SchedulerNode>,
    pub schedtune: Vec<SchedulerNode>,
}

#[derive(Debug, Serialize)]
pub struct SchedulerNode {
    pub group: String,
    pub attribute: String,
    pub path: String,
    pub value: Option<String>,
    pub readable: bool,
    pub writable: bool,
}

pub fn discover() -> SchedulerCapabilities {
    let mut uclamp = Vec::new();
    let mut schedtune = Vec::new();
    for group in GROUPS {
        for root in roots() {
            for attribute in ["cpu.uclamp.min", "cpu.uclamp.max"] {
                let path = root.join(group).join(attribute);
                if path.is_file() {
                    uclamp.push(node(group, attribute, path));
                }
            }
            for attribute in ["schedtune.boost", "schedtune.prefer_idle"] {
                let path = root.join(group).join(attribute);
                if path.is_file() {
                    schedtune.push(node(group, attribute, path));
                }
            }
        }
    }
    SchedulerCapabilities { uclamp, schedtune }
}

pub fn capture_baseline() -> BTreeMap<String, String> {
    discover()
        .uclamp
        .into_iter()
        .chain(discover().schedtune)
        .filter(|node| node.writable)
        .filter_map(|node| node.value.map(|value| (node.path, value)))
        .collect()
}

pub fn resolve_uclamp_path(group: &str, attribute: &str) -> Result<PathBuf, String> {
    if !GROUPS.contains(&group) {
        return Err(format!("unsupported scheduler group: {group}"));
    }
    let filename = match attribute {
        "min" => "cpu.uclamp.min",
        "max" => "cpu.uclamp.max",
        _ => return Err(format!("invalid uclamp attribute: {attribute}")),
    };
    roots()
        .into_iter()
        .map(|root| root.join(group).join(filename))
        .find(|path| path.is_file() && is_writable(path))
        .ok_or_else(|| format!("no writable uclamp interface found for {group}/{attribute}"))
}

fn roots() -> Vec<PathBuf> {
    [
        "/sys/fs/cgroup",
        "/sys/fs/cgroup/cpu",
        "/sys/fs/cgroup/cpu,cpuacct",
        "/dev/cpuctl",
        "/dev/stune",
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect()
}

fn node(group: &str, attribute: &str, path: PathBuf) -> SchedulerNode {
    SchedulerNode {
        group: group.to_string(),
        attribute: attribute.to_string(),
        value: read_value(&path),
        readable: path.is_file(),
        writable: is_writable(&path),
        path: path.display().to_string(),
    }
}

fn read_value(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
}

fn is_writable(path: &Path) -> bool {
    fs::OpenOptions::new().write(true).open(path).is_ok()
}
