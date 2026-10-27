use crate::scheduler;
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct Capabilities {
    pub generated_at: u64,
    pub device: DeviceInformation,
    pub cpu_policies: Vec<CpuPolicy>,
    pub devfreq_devices: Vec<DevfreqDevice>,
    pub thermal_zones: Vec<ThermalZone>,
    pub power_supplies: Vec<PowerSupply>,
    pub memory: MemoryCapabilities,
    pub block_devices: Vec<BlockDevice>,
    pub scheduler: scheduler::SchedulerCapabilities,
}

#[derive(Debug, Serialize)]
pub struct DeviceInformation {
    pub kernel_release: Option<String>,
    pub kernel_version: Option<String>,
    pub architecture: Option<String>,
    pub soc_id: Option<String>,
    pub machine: Option<String>,
    pub android_version: Option<String>,
    pub security_patch: Option<String>,
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
    pub scaling_cur_freq: Option<String>,
    pub cpuinfo_min_freq: Option<String>,
    pub cpuinfo_max_freq: Option<String>,
    pub cpuinfo_cur_freq: Option<String>,
    pub cpuinfo_avg_freq: Option<String>,
    pub readable: Vec<String>,
    pub writable: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DevfreqDevice {
    pub path: String,
    pub backend: String,
    pub name: Option<String>,
    pub governor: Option<String>,
    pub available_governors: Option<String>,
    pub available_frequencies: Option<String>,
    pub cur_freq: Option<String>,
    pub min_freq: Option<String>,
    pub max_freq: Option<String>,
    pub readable: Vec<String>,
    pub writable: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ThermalZone {
    pub path: String,
    pub zone_type: Option<String>,
    pub temperature: Option<String>,
    pub temperature_millicelsius: Option<i64>,
    pub trip_points: Vec<String>,
    pub critical_trip_millicelsius: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct PowerSupply {
    pub path: String,
    pub supply_type: Option<String>,
    pub status: Option<String>,
    pub capacity: Option<String>,
    pub temperature: Option<String>,
    pub voltage_now: Option<String>,
    pub current_now: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MemoryCapabilities {
    pub meminfo: bool,
    pub mem_total_kb: Option<u64>,
    pub mem_available_kb: Option<u64>,
    pub swap_total_kb: Option<u64>,
    pub swap_free_kb: Option<u64>,
    pub zram_devices: Vec<String>,
    pub vm_parameters: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BlockDevice {
    pub path: String,
    pub scheduler: Option<String>,
    pub read_ahead_kb: Option<String>,
    pub rotational: Option<String>,
    pub removable: Option<String>,
    pub readable: Vec<String>,
    pub writable: Vec<String>,
}

pub fn scan() -> Capabilities {
    Capabilities {
        generated_at: unix_timestamp(),
        device: discover_device(),
        cpu_policies: discover_cpu_policies(),
        devfreq_devices: discover_devfreq_devices(),
        thermal_zones: discover_thermal_zones(),
        power_supplies: discover_power_supplies(),
        memory: discover_memory(),
        block_devices: discover_block_devices(),
        scheduler: scheduler::discover(),
    }
}

pub fn capture_baseline() -> BTreeMap<String, String> {
    let mut values = BTreeMap::new();

    for policy in policy_paths() {
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

    values.extend(scheduler::capture_baseline());

    values
}

fn discover_device() -> DeviceInformation {
    DeviceInformation {
        kernel_release: command_value("uname", &["-r"]),
        kernel_version: read_value(Path::new("/proc/version")),
        architecture: command_value("uname", &["-m"]),
        soc_id: read_value(Path::new("/sys/devices/soc0/soc_id")),
        machine: read_value(Path::new("/sys/devices/soc0/machine")),
        android_version: property_value("ro.build.version.release"),
        security_patch: property_value("ro.build.version.security_patch"),
    }
}

fn discover_cpu_policies() -> Vec<CpuPolicy> {
    policy_paths()
        .into_iter()
        .map(|path| {
            let readable_names = [
                "affected_cpus",
                "related_cpus",
                "scaling_driver",
                "scaling_governor",
                "scaling_available_governors",
                "scaling_available_frequencies",
                "scaling_min_freq",
                "scaling_max_freq",
                "scaling_cur_freq",
                "cpuinfo_min_freq",
                "cpuinfo_max_freq",
                "cpuinfo_cur_freq",
                "cpuinfo_avg_freq",
            ];
            CpuPolicy {
                path: path.display().to_string(),
                affected_cpus: read_value(&path.join("affected_cpus")),
                related_cpus: read_value(&path.join("related_cpus")),
                scaling_driver: read_value(&path.join("scaling_driver")),
                scaling_governor: read_value(&path.join("scaling_governor")),
                available_governors: read_value(&path.join("scaling_available_governors")),
                available_frequencies: read_value(&path.join("scaling_available_frequencies")),
                scaling_min_freq: read_value(&path.join("scaling_min_freq")),
                scaling_max_freq: read_value(&path.join("scaling_max_freq")),
                scaling_cur_freq: read_value(&path.join("scaling_cur_freq")),
                cpuinfo_min_freq: read_value(&path.join("cpuinfo_min_freq")),
                cpuinfo_max_freq: read_value(&path.join("cpuinfo_max_freq")),
                cpuinfo_cur_freq: read_value(&path.join("cpuinfo_cur_freq")),
                cpuinfo_avg_freq: read_value(&path.join("cpuinfo_avg_freq")),
                readable: readable_names
                    .iter()
                    .filter(|name| path.join(name).is_file())
                    .map(|name| (*name).to_string())
                    .collect(),
                writable: writable_names(
                    &path,
                    &[
                        "scaling_governor",
                        "scaling_min_freq",
                        "scaling_max_freq",
                        "scaling_setspeed",
                    ],
                ),
            }
        })
        .collect()
}

fn discover_devfreq_devices() -> Vec<DevfreqDevice> {
    entries(Path::new("/sys/class/devfreq"))
        .into_iter()
        .map(|path| {
            let names = [
                "name",
                "governor",
                "available_governors",
                "available_frequencies",
                "cur_freq",
                "min_freq",
                "max_freq",
                "scaling_min_freq",
                "scaling_max_freq",
            ];
            DevfreqDevice {
                path: path.display().to_string(),
                backend: classify_devfreq_backend(&path),
                name: read_value(&path.join("name")),
                governor: read_value(&path.join("governor")),
                available_governors: read_value(&path.join("available_governors")),
                available_frequencies: read_value(&path.join("available_frequencies")),
                cur_freq: read_value(&path.join("cur_freq")),
                min_freq: read_value_first(&path, &["min_freq", "scaling_min_freq"]),
                max_freq: read_value_first(&path, &["max_freq", "scaling_max_freq"]),
                readable: names
                    .iter()
                    .filter(|name| path.join(name).is_file())
                    .map(|name| (*name).to_string())
                    .collect(),
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
            }
        })
        .collect()
}

fn classify_devfreq_backend(path: &Path) -> String {
    let identity = format!(
        "{} {}",
        path.display(),
        read_value(&path.join("name")).unwrap_or_default()
    )
    .to_ascii_lowercase();
    if identity.contains("kgsl") {
        "qualcomm-kgsl".to_string()
    } else if identity.contains("mali") || identity.contains("panfrost") {
        "mali-devfreq".to_string()
    } else if identity.contains("ged") || identity.contains("gpufreq") {
        "mediatek-vendor".to_string()
    } else {
        "generic-devfreq".to_string()
    }
}

fn discover_thermal_zones() -> Vec<ThermalZone> {
    entries(Path::new("/sys/class/thermal"))
        .into_iter()
        .filter(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("thermal_zone"))
        })
        .map(|path| {
            let trip_points = entries(&path)
                .into_iter()
                .filter_map(|entry| {
                    let name = entry.file_name()?.to_string_lossy().to_string();
                    name.starts_with("trip_point_").then(|| name)
                })
                .collect::<Vec<_>>();
            ThermalZone {
                path: path.display().to_string(),
                zone_type: read_value(&path.join("type")),
                temperature: read_value(&path.join("temp")),
                temperature_millicelsius: read_i64(&path.join("temp")),
                critical_trip_millicelsius: critical_trip(&path, &trip_points),
                trip_points,
            }
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
            voltage_now: read_value(&path.join("voltage_now")),
            current_now: read_value(&path.join("current_now")),
        })
        .collect()
}

fn discover_memory() -> MemoryCapabilities {
    let meminfo = read_meminfo();
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
        mem_total_kb: meminfo.get("MemTotal").copied(),
        mem_available_kb: meminfo.get("MemAvailable").copied(),
        swap_total_kb: meminfo.get("SwapTotal").copied(),
        swap_free_kb: meminfo.get("SwapFree").copied(),
        zram_devices,
        vm_parameters,
    }
}

fn discover_block_devices() -> Vec<BlockDevice> {
    entries(Path::new("/sys/block"))
        .into_iter()
        .map(|path| {
            let queue = path.join("queue");
            let readable_names = ["scheduler", "read_ahead_kb", "rotational", "removable"];
            BlockDevice {
                path: path.display().to_string(),
                scheduler: read_value(&queue.join("scheduler")),
                read_ahead_kb: read_value(&queue.join("read_ahead_kb")),
                rotational: read_value(&queue.join("rotational")),
                removable: read_value(&queue.join("removable")),
                readable: readable_names
                    .iter()
                    .filter(|name| queue.join(name).is_file())
                    .map(|name| (*name).to_string())
                    .collect(),
                writable: writable_names(&queue, &["scheduler", "read_ahead_kb"]),
            }
        })
        .collect()
}

fn policy_paths() -> Vec<PathBuf> {
    entries(Path::new("/sys/devices/system/cpu/cpufreq"))
        .into_iter()
        .filter(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("policy"))
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

fn read_i64(path: &Path) -> Option<i64> {
    read_value(path)?.parse().ok()
}

fn critical_trip(path: &Path, trip_points: &[String]) -> Option<i64> {
    trip_points
        .iter()
        .filter(|name| name.ends_with("_type"))
        .filter_map(|name| {
            let kind = read_value(&path.join(name))?;
            if kind.eq_ignore_ascii_case("critical") {
                let prefix = name.trim_end_matches("_type");
                read_i64(&path.join(format!("{prefix}_temp")))
            } else {
                None
            }
        })
        .max()
}

fn read_value_first(path: &Path, names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| read_value(&path.join(name)))
}

fn read_meminfo() -> BTreeMap<String, u64> {
    read_value(Path::new("/proc/meminfo"))
        .map(|content| {
            content
                .lines()
                .filter_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    let value = value.split_whitespace().next()?.parse().ok()?;
                    Some((name.to_string(), value))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn property_value(name: &str) -> Option<String> {
    command_value("getprop", &[name])
}

fn command_value(command: &str, arguments: &[&str]) -> Option<String> {
    std::process::Command::new(command)
        .args(arguments)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
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
