use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct Capabilities {
    pub generated_at: u64,
    pub cpu_policies: Vec<CpuPolicy>,
    pub devfreq_devices: Vec<DevfreqDevice>,
    pub thermal_zones: Vec<ThermalZone>,
    pub power_supplies: Vec<PowerSupply>,
    pub memory: MemoryCapabilities,
    pub block_devices: Vec<BlockDevice>,
}

#[derive(Debug, Serialize)]
pub struct CpuPolicy {
    pub path: String,
    pub affected_cpus: Option<String>,
    pub related_cpus: Option<String>,
    pub scaling_driver: Option<String>,
    pub scaling_governor: Option<String>,
    pub available_governors: Option<String>,
    pub available_frequencies: Option<String>,
    pub scaling_min_freq: Option<String>,
    pub scaling_max_freq: Option<String>,
    pub writable: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DevfreqDevice {
    pub path: String,
    pub name: Option<String>,
    pub governor: Option<String>,
    pub available_governors: Option<String>,
    pub available_frequencies: Option<String>,
    pub cur_freq: Option<String>,
    pub min_freq: Option<String>,
    pub max_freq: Option<String>,
    pub writable: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ThermalZone {
    pub path: String,
    pub zone_type: Option<String>,
    pub temperature: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PowerSupply {
    pub path: String,
    pub supply_type: Option<String>,
    pub status: Option<String>,
    pub capacity: Option<String>,
    pub temperature: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MemoryCapabilities {
    pub meminfo: bool,
    pub zram_devices: Vec<String>,
    pub vm_parameters: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BlockDevice {
    pub path: String,
    pub scheduler: Option<String>,
    pub read_ahead_kb: Option<String>,
    pub writable: Vec<String>,
}

pub fn scan() -> Capabilities {
    Capabilities {
        generated_at: unix_timestamp(),
        cpu_policies: discover_cpu_policies(),
        devfreq_devices: discover_devfreq_devices(),
        thermal_zones: discover_thermal_zones(),
        power_supplies: discover_power_supplies(),
        memory: discover_memory(),
        block_devices: discover_block_devices(),
    }
}

pub fn capture_baseline() -> BTreeMap<String, String> {
    let mut values = BTreeMap::new();

    for policy in entries(Path::new("/sys/devices/system/cpu/cpufreq"))
        .into_iter()
        .filter(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("policy"))
        })
    {
        capture_paths(
            &mut values,
            &policy,
            &[
                "scaling_governor",
                "scaling_min_freq",
                "scaling_max_freq",
                "scaling_setspeed",
            ],
        );
    }

    for device in entries(Path::new("/sys/class/devfreq")) {
        capture_paths(
            &mut values,
            &device,
            &[
                "governor",
                "min_freq",
                "max_freq",
                "scaling_min_freq",
                "scaling_max_freq",
            ],
        );
    }

    for device in entries(Path::new("/sys/block")) {
        capture_paths(
            &mut values,
            &device.join("queue"),
            &["scheduler", "read_ahead_kb"],
        );
    }

    values
}

fn discover_cpu_policies() -> Vec<CpuPolicy> {
    entries(Path::new("/sys/devices/system/cpu/cpufreq"))
        .into_iter()
        .filter(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("policy"))
        })
        .map(|path| CpuPolicy {
            path: path.display().to_string(),
            affected_cpus: read_value(&path.join("affected_cpus")),
            related_cpus: read_value(&path.join("related_cpus")),
            scaling_driver: read_value(&path.join("scaling_driver")),
            scaling_governor: read_value(&path.join("scaling_governor")),
            available_governors: read_value(&path.join("scaling_available_governors")),
            available_frequencies: read_value(&path.join("scaling_available_frequencies")),
            scaling_min_freq: read_value(&path.join("scaling_min_freq")),
            scaling_max_freq: read_value(&path.join("scaling_max_freq")),
            writable: writable_names(
                &path,
                &[
                    "scaling_governor",
                    "scaling_min_freq",
                    "scaling_max_freq",
                    "scaling_setspeed",
                ],
            ),
        })
        .collect()
}

fn discover_devfreq_devices() -> Vec<DevfreqDevice> {
    entries(Path::new("/sys/class/devfreq"))
        .into_iter()
        .map(|path| DevfreqDevice {
            path: path.display().to_string(),
            name: read_value(&path.join("name")),
            governor: read_value(&path.join("governor")),
            available_governors: read_value(&path.join("available_governors")),
            available_frequencies: read_value(&path.join("available_frequencies")),
            cur_freq: read_value(&path.join("cur_freq")),
            min_freq: read_value_first(&path, &["min_freq", "scaling_min_freq"]),
            max_freq: read_value_first(&path, &["max_freq", "scaling_max_freq"]),
            writable: writable_names(
                &path,
                &[
                    "governor",
                    "min_freq",
                    "max_freq",
                    "scaling_min_freq",
                    "scaling_max_freq",
                ],
            ),
        })
        .collect()
}

fn discover_thermal_zones() -> Vec<ThermalZone> {
    entries(Path::new("/sys/class/thermal"))
        .into_iter()
        .filter(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("thermal_zone"))
        })
        .map(|path| ThermalZone {
            path: path.display().to_string(),
            zone_type: read_value(&path.join("type")),
            temperature: read_value(&path.join("temp")),
        })
        .collect()
}

fn discover_power_supplies() -> Vec<PowerSupply> {
    entries(Path::new("/sys/class/power_supply"))
        .into_iter()
        .map(|path| PowerSupply {
            path: path.display().to_string(),
            supply_type: read_value(&path.join("type")),
            status: read_value(&path.join("status")),
            capacity: read_value(&path.join("capacity")),
            temperature: read_value_first(&path, &["temp", "temperature"]),
        })
        .collect()
}

fn discover_memory() -> MemoryCapabilities {
    let zram_devices = entries(Path::new("/sys/block"))
        .into_iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_string_lossy();
            name.starts_with("zram").then(|| path.display().to_string())
        })
        .collect();
    let vm_parameters = entries(Path::new("/proc/sys/vm"))
        .into_iter()
        .filter_map(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .collect();
    MemoryCapabilities {
        meminfo: Path::new("/proc/meminfo").is_file(),
        zram_devices,
        vm_parameters,
    }
}

fn discover_block_devices() -> Vec<BlockDevice> {
    entries(Path::new("/sys/block"))
        .into_iter()
        .map(|path| {
            let queue = path.join("queue");
            BlockDevice {
                path: path.display().to_string(),
                scheduler: read_value(&queue.join("scheduler")),
                read_ahead_kb: read_value(&queue.join("read_ahead_kb")),
                writable: writable_names(&queue, &["scheduler", "read_ahead_kb"]),
            }
        })
        .collect()
}

fn entries(path: &Path) -> Vec<PathBuf> {
    fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .collect()
        })
        .unwrap_or_default()
}

fn read_value(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
}

fn read_value_first(path: &Path, names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| read_value(&path.join(name)))
}

fn writable_names(path: &Path, names: &[&str]) -> Vec<String> {
    names
        .iter()
        .filter(|name| is_writable(&path.join(name)))
        .map(|name| (*name).to_string())
        .collect()
}

fn capture_paths(values: &mut BTreeMap<String, String>, base: &Path, names: &[&str]) {
    for name in names {
        let path = base.join(name);
        if is_writable(&path) {
            if let Some(value) = read_value(&path) {
                values.insert(path.display().to_string(), value);
            }
        }
    }
}

fn is_writable(path: &Path) -> bool {
    fs::OpenOptions::new().write(true).open(path).is_ok()
}

fn unix_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default()
}
