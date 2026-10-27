use crate::config::RuntimeConfig;
use crate::discovery;
use crate::profiles;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct ValidationReport {
    pub passed: bool,
    pub checks: Vec<ValidationCheck>,
}

#[derive(Debug, Serialize)]
pub struct ValidationCheck {
    pub name: String,
    pub status: String,
    pub detail: String,
}

pub fn run(config: &RuntimeConfig) -> ValidationReport {
    let mut checks = Vec::new();
    checks.push(directory_check("state_dir", &config.state_dir));
    checks.push(directory_check("profiles_dir", &config.profiles_dir));
    checks.push(directory_check("sysfs", Path::new("/sys")));
    checks.push(directory_check("proc_sys", Path::new("/proc/sys")));
    checks.push(file_check("baseline", &config.baseline_file));
    checks.push(file_check("capabilities", &config.capabilities_file));
    checks.push(file_check(
        "tcp_congestion_control",
        Path::new("/proc/sys/net/ipv4/tcp_congestion_control"),
    ));

    let capabilities = discovery::scan();
    checks.push(ValidationCheck {
        name: "discovery".to_string(),
        status: "pass".to_string(),
        detail: format!(
            "{} CPU policies, {} Devfreq devices, {} thermal zones, {} cores, {} network interfaces",
            capabilities.cpu_policies.len(),
            capabilities.devfreq_devices.len(),
            capabilities.thermal_zones.len(),
            capabilities.cores.len(),
            capabilities.network.interfaces.len()
        ),
    });
    checks.push(ValidationCheck {
        name: "built_in_profiles".to_string(),
        status: "pass".to_string(),
        detail: format!("{} profiles available", profiles::builtin_profiles().len()),
    });

    ValidationReport {
        passed: checks.iter().all(|check| check.status != "fail"),
        checks,
    }
}

fn directory_check(name: &str, path: &Path) -> ValidationCheck {
    if path.is_dir() {
        ValidationCheck {
            name: name.to_string(),
            status: "pass".to_string(),
            detail: path.display().to_string(),
        }
    } else {
        ValidationCheck {
            name: name.to_string(),
            status: "fail".to_string(),
            detail: format!("directory is unavailable: {}", path.display()),
        }
    }
}

fn file_check(name: &str, path: &Path) -> ValidationCheck {
    if path.is_file() {
        ValidationCheck {
            name: name.to_string(),
            status: "pass".to_string(),
            detail: path.display().to_string(),
        }
    } else if name == "baseline" || name == "capabilities" {
        ValidationCheck {
            name: name.to_string(),
            status: "warn".to_string(),
            detail: format!("not created yet: {}", path.display()),
        }
    } else {
        ValidationCheck {
            name: name.to_string(),
            status: "fail".to_string(),
            detail: format!("file is unavailable: {}", path.display()),
        }
    }
}
