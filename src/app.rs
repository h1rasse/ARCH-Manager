use crate::config::RuntimeConfig;
use crate::discovery;
use crate::logging;
use crate::state::{Baseline, ProcessLock};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub struct Application {
    config: RuntimeConfig,
}

impl Application {
    pub fn new(config: RuntimeConfig) -> Self {
        Self { config }
    }

    pub fn run(&self, arguments: Vec<String>) -> Result<(), String> {
        self.prepare().map_err(|error| error.to_string())?;
        match arguments.as_slice() {
            [command] if command == "capture" => self.capture(),
            [command] if command == "scan" => self.scan(),
            [command] if command == "status" => self.status(false),
            [command, flag] if command == "status" && flag == "--json" => self.status(true),
            [command] if command == "restore" => self.restore(),
            [command, action] if command == "cpu" && action == "list" => self.cpu_list(),
            [command, action, policy, value] if command == "cpu" && action == "set-governor" => {
                self.set_cpu_governor(policy, value)
            }
            [command, action, policy, value] if command == "cpu" && action == "set-min" => {
                self.set_cpu_frequency(policy, "scaling_min_freq", value)
            }
            [command, action, policy, value] if command == "cpu" && action == "set-max" => {
                self.set_cpu_frequency(policy, "scaling_max_freq", value)
            }
            [command] if command == "help" => {
                Self::print_help();
                Ok(())
            }
            [] => {
                Self::print_help();
                Ok(())
            }
            _ => Err(format!("invalid command: {}", arguments.join(" "))),
        }
    }

    fn prepare(&self) -> io::Result<()> {
        fs::create_dir_all(&self.config.state_dir)
    }

    fn scan(&self) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let capabilities = discovery::scan();
        let serialized =
            serde_json::to_string_pretty(&capabilities).map_err(|error| error.to_string())?;
        fs::write(&self.config.capabilities_file, format!("{serialized}\n"))
            .map_err(|error| error.to_string())?;
        logging::write(&self.config, "INFO", "capability scan completed")
            .map_err(|error| error.to_string())?;
        println!("Capability scan completed");
        println!("Output: {}", self.config.capabilities_file.display());
        Ok(())
    }

    fn capture(&self) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let baseline = Baseline {
            values: discovery::capture_baseline(),
        };
        baseline
            .save(&self.config.baseline_file)
            .map_err(|error| error.to_string())?;
        logging::write(&self.config, "INFO", "baseline capture completed")
            .map_err(|error| error.to_string())?;
        println!("Baseline capture completed");
        println!("Output: {}", self.config.baseline_file.display());
        Ok(())
    }

    fn status(&self, json: bool) -> Result<(), String> {
        let content = fs::read_to_string(&self.config.capabilities_file)
            .map_err(|error| error.to_string())?;
        let value: Value = serde_json::from_str(&content).map_err(|error| error.to_string())?;
        if json {
            println!(
                "{}",
                serde_json::to_string(&value).map_err(|error| error.to_string())?
            );
        } else {
            println!(
                "{}",
                serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?
            );
        }
        Ok(())
    }

    fn cpu_list(&self) -> Result<(), String> {
        let capabilities = discovery::scan();
        println!(
            "{}",
            serde_json::to_string_pretty(&capabilities.cpu_policies)
                .map_err(|error| error.to_string())?
        );
        Ok(())
    }

    fn set_cpu_governor(&self, policy: &str, governor: &str) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let policy_path = resolve_policy_path(policy)?;
        let available = read_required(&policy_path.join("scaling_available_governors"))?;
        if !available.split_whitespace().any(|item| item == governor) {
            return Err(format!("governor is not available: {governor}"));
        }
        let target = policy_path.join("scaling_governor");
        ensure_writable(&target)?;
        self.capture_target_baseline(&target)?;
        write_and_verify(&target, governor)?;
        logging::write(
            &self.config,
            "INFO",
            &format!("CPU governor set for {policy}"),
        )
        .map_err(|error| error.to_string())?;
        println!("CPU governor updated: {policy} -> {governor}");
        Ok(())
    }

    fn set_cpu_frequency(&self, policy: &str, attribute: &str, value: &str) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let policy_path = resolve_policy_path(policy)?;
        let requested = parse_frequency(value)?;
        let hardware_min = read_optional_u64(&policy_path.join("cpuinfo_min_freq"));
        let hardware_max = read_optional_u64(&policy_path.join("cpuinfo_max_freq"));
        if let Some(minimum) = hardware_min {
            if requested < minimum {
                return Err(format!(
                    "frequency is below hardware minimum: {requested} < {minimum}"
                ));
            }
        }
        if let Some(maximum) = hardware_max {
            if requested > maximum {
                return Err(format!(
                    "frequency is above hardware maximum: {requested} > {maximum}"
                ));
            }
        }
        let current_min = read_optional_u64(&policy_path.join("scaling_min_freq"));
        let current_max = read_optional_u64(&policy_path.join("scaling_max_freq"));
        if attribute == "scaling_min_freq" {
            if let Some(maximum) = current_max {
                if requested > maximum {
                    return Err(format!(
                        "minimum frequency exceeds current maximum: {requested} > {maximum}"
                    ));
                }
            }
        } else if let Some(minimum) = current_min {
            if requested < minimum {
                return Err(format!(
                    "maximum frequency is below current minimum: {requested} < {minimum}"
                ));
            }
        }
        let target = policy_path.join(attribute);
        ensure_writable(&target)?;
        self.capture_target_baseline(&target)?;
        write_and_verify(&target, &requested.to_string())?;
        logging::write(
            &self.config,
            "INFO",
            &format!("CPU frequency updated for {policy}"),
        )
        .map_err(|error| error.to_string())?;
        println!("CPU frequency updated: {policy} {attribute} -> {requested}");
        Ok(())
    }

    fn capture_target_baseline(&self, target: &Path) -> Result<(), String> {
        let current = read_required(target)?;
        let mut baseline = if self.config.baseline_file.is_file() {
            Baseline::load(&self.config.baseline_file).map_err(|error| error.to_string())?
        } else {
            Baseline {
                values: discovery::capture_baseline(),
            }
        };
        baseline
            .values
            .entry(target.display().to_string())
            .or_insert(current);
        baseline
            .save(&self.config.baseline_file)
            .map_err(|error| error.to_string())
    }

    fn restore(&self) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let baseline =
            Baseline::load(&self.config.baseline_file).map_err(|error| error.to_string())?;
        for (path, value) in baseline.values {
            validate_write_path(Path::new(&path))?;
            ensure_writable(Path::new(&path))?;
            write_and_verify(Path::new(&path), &value)?;
        }
        logging::write(&self.config, "INFO", "baseline restore completed")
            .map_err(|error| error.to_string())?;
        println!("Baseline restore completed");
        Ok(())
    }

    fn print_help() {
        println!("ARCH Manager CLI");
        println!();
        println!("Usage:");
        println!("  archctl scan");
        println!("  archctl status [--json]");
        println!("  archctl capture");
        println!("  archctl restore");
        println!("  archctl cpu list");
        println!("  archctl cpu set-governor <policy> <governor>");
        println!("  archctl cpu set-min <policy> <frequency>");
        println!("  archctl cpu set-max <policy> <frequency>");
    }
}

fn resolve_policy_path(policy: &str) -> Result<PathBuf, String> {
    let name = Path::new(policy)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "invalid CPU policy".to_string())?;
    if !name.starts_with("policy")
        || !name[6..]
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        return Err(format!("invalid CPU policy: {policy}"));
    }
    let path = PathBuf::from("/sys/devices/system/cpu/cpufreq").join(name);
    if !path.is_dir() {
        return Err(format!("CPU policy does not exist: {name}"));
    }
    Ok(path)
}

fn parse_frequency(value: &str) -> Result<u64, String> {
    value
        .parse::<u64>()
        .map_err(|_| format!("invalid frequency: {value}"))
}

fn read_required(path: &Path) -> Result<String, String> {
    fs::read_to_string(path)
        .map(|value| value.trim().to_string())
        .map_err(|error| format!("failed to read {}: {error}", path.display()))
}

fn read_optional_u64(path: &Path) -> Option<u64> {
    read_required(path).ok()?.parse().ok()
}

fn ensure_writable(path: &Path) -> Result<(), String> {
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map(|_| ())
        .map_err(|error| format!("path is not writable {}: {error}", path.display()))
}

fn write_and_verify(path: &Path, value: &str) -> Result<(), String> {
    fs::write(path, value.as_bytes())
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    let actual = read_required(path)?;
    if actual == value
        || (value.parse::<u64>().ok().is_some()
            && actual.parse::<u64>().ok() == value.parse::<u64>().ok())
    {
        Ok(())
    } else {
        Err(format!(
            "write verification failed for {}: expected {value}, got {actual}",
            path.display()
        ))
    }
}

fn validate_write_path(path: &Path) -> Result<(), String> {
    let path = path.to_string_lossy();
    let allowed = path.starts_with("/sys/") || path.starts_with("/proc/sys/");
    if allowed {
        Ok(())
    } else {
        Err(format!("refusing unsafe restore path: {path}"))
    }
}

fn lock_error(error: io::Error) -> String {
    if error.kind() == io::ErrorKind::AlreadyExists {
        "another ARCH Manager process is active".to_string()
    } else {
        error.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_frequency, resolve_policy_path, validate_write_path};
    use std::path::Path;

    #[test]
    fn accepts_kernel_sysfs_paths() {
        assert!(validate_write_path(Path::new(
            "/sys/devices/system/cpu/cpufreq/policy0/scaling_min_freq"
        ))
        .is_ok());
    }

    #[test]
    fn rejects_user_data_paths() {
        assert!(validate_write_path(Path::new("/data/adb/arch-manager/state/value")).is_err());
    }

    #[test]
    fn parses_non_negative_frequency() {
        assert_eq!(parse_frequency("300000").unwrap(), 300000);
        assert!(parse_frequency("-1").is_err());
    }

    #[test]
    fn rejects_invalid_policy_names() {
        assert!(resolve_policy_path("policyx").is_err());
        assert!(resolve_policy_path("../policy0").is_err());
    }
}
