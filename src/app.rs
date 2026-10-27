use crate::config::RuntimeConfig;
use crate::discovery;
use crate::logging;
use crate::profiles::{self, Profile};
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
            [command, action] if command == "gpu" && action == "list" => self.gpu_list(),
            [command, action] if command == "thermal" && action == "list" => self.thermal_list(),
            [command, action] if command == "thermal" && action == "check" => self.thermal_check(),
            [command, action] if command == "profile" && action == "list" => self.profile_list(),
            [command, action, name] if command == "profile" && action == "show" => {
                self.profile_show(name)
            }
            [command, action, name] if command == "profile" && action == "apply" => {
                self.profile_apply(name, false)
            }
            [command, action, name, flag]
                if command == "profile" && action == "apply" && flag == "--dry-run" =>
            {
                self.profile_apply(name, true)
            }
            [command, action] if command == "profile" && action == "restore" => self.restore(),
            [command, action, policy, value] if command == "cpu" && action == "set-governor" => {
                self.set_cpu_governor(policy, value)
            }
            [command, action, policy, value] if command == "cpu" && action == "set-min" => {
                self.set_cpu_frequency(policy, "scaling_min_freq", value)
            }
            [command, action, policy, value] if command == "cpu" && action == "set-max" => {
                self.set_cpu_frequency(policy, "scaling_max_freq", value)
            }
            [command, action, device, value] if command == "gpu" && action == "set-governor" => {
                self.set_gpu_governor(device, value)
            }
            [command, action, device, value] if command == "gpu" && action == "set-min" => {
                self.set_gpu_frequency(device, "min_freq", value)
            }
            [command, action, device, value] if command == "gpu" && action == "set-max" => {
                self.set_gpu_frequency(device, "max_freq", value)
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
            .and_then(|_| fs::create_dir_all(&self.config.profiles_dir))
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

    fn gpu_list(&self) -> Result<(), String> {
        let capabilities = discovery::scan();
        println!(
            "{}",
            serde_json::to_string_pretty(&capabilities.devfreq_devices)
                .map_err(|error| error.to_string())?
        );
        Ok(())
    }

    fn thermal_list(&self) -> Result<(), String> {
        let capabilities = discovery::scan();
        println!(
            "{}",
            serde_json::to_string_pretty(&capabilities.thermal_zones)
                .map_err(|error| error.to_string())?
        );
        Ok(())
    }

    fn thermal_check(&self) -> Result<(), String> {
        let capabilities = discovery::scan();
        let hottest = capabilities
            .thermal_zones
            .iter()
            .filter_map(|zone| zone.temperature_millicelsius)
            .max();
        let limit = thermal_limit_millicelsius();
        let safe = hottest.map(|value| value < limit).unwrap_or(true);
        let report = serde_json::json!({
            "hottest_millicelsius": hottest,
            "limit_millicelsius": limit,
            "safe_for_performance_increase": safe,
            "thermal_zones": capabilities.thermal_zones,
        });
        println!(
            "{}",
            serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
        );
        Ok(())
    }

    fn profile_list(&self) -> Result<(), String> {
        let mut profiles = profiles::builtin_profiles();
        for name in profiles::custom_names(&self.config.profiles_dir) {
            if let Ok(profile) = profiles::load(&name, &self.config.profiles_dir) {
                profiles.push(profile);
            }
        }
        println!(
            "{}",
            serde_json::to_string_pretty(&profiles).map_err(|error| error.to_string())?
        );
        Ok(())
    }

    fn profile_show(&self, name: &str) -> Result<(), String> {
        let profile = self.load_profile(name)?;
        println!(
            "{}",
            serde_json::to_string_pretty(&profile).map_err(|error| error.to_string())?
        );
        Ok(())
    }

    fn profile_apply(&self, name: &str, dry_run: bool) -> Result<(), String> {
        let profile = self.load_profile(name)?;
        if profile.name == "stock" {
            if dry_run {
                println!("Dry run: restore captured baseline");
                return Ok(());
            }
            return self.restore();
        }
        let capabilities = discovery::scan();
        let mut attempted = 0_u32;
        let mut failed = 0_u32;

        for policy in &capabilities.cpu_policies {
            let name = policy_name(&policy.path)?;
            if let Some(governor) = profile.cpu_governor.as_deref() {
                if policy
                    .available_governors
                    .as_deref()
                    .unwrap_or_default()
                    .split_whitespace()
                    .any(|value| value == governor)
                {
                    attempted += 1;
                    if dry_run {
                        println!("Dry run: CPU {name} governor -> {governor}");
                    } else if let Err(error) = self.set_cpu_governor(&name, governor) {
                        failed += 1;
                        eprintln!("Skipped CPU {name} governor: {error}");
                    }
                } else {
                    eprintln!("Skipped CPU {name}: governor unavailable: {governor}");
                }
            }
            if let Some(frequency) = profile.cpu_max_freq {
                attempted += 1;
                if dry_run {
                    println!("Dry run: CPU {name} maximum frequency -> {frequency}");
                } else if let Err(error) =
                    self.set_cpu_frequency(&name, "scaling_max_freq", &frequency.to_string())
                {
                    failed += 1;
                    eprintln!("Skipped CPU {name} maximum frequency: {error}");
                }
            }
            if let Some(frequency) = profile.cpu_min_freq {
                attempted += 1;
                if dry_run {
                    println!("Dry run: CPU {name} minimum frequency -> {frequency}");
                } else if let Err(error) =
                    self.set_cpu_frequency(&name, "scaling_min_freq", &frequency.to_string())
                {
                    failed += 1;
                    eprintln!("Skipped CPU {name} minimum frequency: {error}");
                }
            }
        }

        for device in &capabilities.devfreq_devices {
            let name = device_name(&device.path)?;
            if let Some(governor) = profile.gpu_governor.as_deref() {
                if device
                    .available_governors
                    .as_deref()
                    .unwrap_or_default()
                    .split_whitespace()
                    .any(|value| value == governor)
                {
                    attempted += 1;
                    if dry_run {
                        println!("Dry run: GPU {name} governor -> {governor}");
                    } else if let Err(error) = self.set_gpu_governor(&name, governor) {
                        failed += 1;
                        eprintln!("Skipped GPU {name} governor: {error}");
                    }
                } else {
                    eprintln!("Skipped GPU {name}: governor unavailable: {governor}");
                }
            }
            if let Some(frequency) = profile.gpu_max_freq {
                attempted += 1;
                if dry_run {
                    println!("Dry run: GPU {name} maximum frequency -> {frequency}");
                } else if let Err(error) =
                    self.set_gpu_frequency(&name, "max_freq", &frequency.to_string())
                {
                    failed += 1;
                    eprintln!("Skipped GPU {name} maximum frequency: {error}");
                }
            }
            if let Some(frequency) = profile.gpu_min_freq {
                attempted += 1;
                if dry_run {
                    println!("Dry run: GPU {name} minimum frequency -> {frequency}");
                } else if let Err(error) =
                    self.set_gpu_frequency(&name, "min_freq", &frequency.to_string())
                {
                    failed += 1;
                    eprintln!("Skipped GPU {name} minimum frequency: {error}");
                }
            }
        }

        if dry_run {
            println!("Dry run completed: {attempted} planned operation(s)");
        } else if failed == 0 {
            println!(
                "Profile applied: {} ({attempted} operation(s))",
                profile.name
            );
        } else {
            println!(
                "Profile partially applied: {} ({failed} failure(s))",
                profile.name
            );
        }
        Ok(())
    }

    fn load_profile(&self, name: &str) -> Result<Profile, String> {
        profiles::load(name, &self.config.profiles_dir)
    }

    fn set_cpu_governor(&self, policy: &str, governor: &str) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let policy_path = resolve_policy_path(policy)?;
        let available = read_required(&policy_path.join("scaling_available_governors"))?;
        if !available.split_whitespace().any(|item| item == governor) {
            return Err(format!("governor is not available: {governor}"));
        }
        if is_performance_governor(governor) {
            ensure_thermal_safe_for_increase()?;
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
            if current_min
                .map(|minimum| requested > minimum)
                .unwrap_or(true)
            {
                ensure_thermal_safe_for_increase()?;
            }
        } else if let Some(minimum) = current_min {
            if requested < minimum {
                return Err(format!(
                    "maximum frequency is below current minimum: {requested} < {minimum}"
                ));
            }
            if current_max
                .map(|maximum| requested > maximum)
                .unwrap_or(true)
            {
                ensure_thermal_safe_for_increase()?;
            }
        } else {
            ensure_thermal_safe_for_increase()?;
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

    fn set_gpu_governor(&self, device: &str, governor: &str) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let device_path = resolve_devfreq_path(device)?;
        let available = read_required(&device_path.join("available_governors"))?;
        if !available.split_whitespace().any(|item| item == governor) {
            return Err(format!("GPU governor is not available: {governor}"));
        }
        if is_performance_governor(governor) {
            ensure_thermal_safe_for_increase()?;
        }
        let target = device_path.join("governor");
        ensure_writable(&target)?;
        self.capture_target_baseline(&target)?;
        write_and_verify(&target, governor)?;
        logging::write(
            &self.config,
            "INFO",
            &format!("GPU governor set for {device}"),
        )
        .map_err(|error| error.to_string())?;
        println!("GPU governor updated: {device} -> {governor}");
        Ok(())
    }

    fn set_gpu_frequency(&self, device: &str, attribute: &str, value: &str) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let device_path = resolve_devfreq_path(device)?;
        let requested = parse_frequency(value)?;
        validate_devfreq_frequency(&device_path, attribute, requested)?;
        let current = read_optional_first_u64(
            &device_path,
            match attribute {
                "min_freq" => &["min_freq", "scaling_min_freq"],
                "max_freq" => &["max_freq", "scaling_max_freq"],
                _ => &[],
            },
        );
        if current.map(|value| requested > value).unwrap_or(true) {
            ensure_thermal_safe_for_increase()?;
        }
        let target = resolve_devfreq_frequency_path(&device_path, attribute)?;
        self.capture_target_baseline(&target)?;
        write_and_verify(&target, &requested.to_string())?;
        logging::write(
            &self.config,
            "INFO",
            &format!("GPU frequency updated for {device}"),
        )
        .map_err(|error| error.to_string())?;
        println!("GPU frequency updated: {device} {attribute} -> {requested}");
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
        println!("  archctl gpu list");
        println!("  archctl gpu set-governor <device> <governor>");
        println!("  archctl gpu set-min <device> <frequency>");
        println!("  archctl gpu set-max <device> <frequency>");
        println!("  archctl thermal list");
        println!("  archctl thermal check");
        println!("  archctl profile list");
        println!("  archctl profile show <name>");
        println!("  archctl profile apply <name> [--dry-run]");
        println!("  archctl profile restore");
    }
}

fn policy_name(path: &str) -> Result<String, String> {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or_else(|| format!("invalid CPU policy path: {path}"))
}

fn device_name(path: &str) -> Result<String, String> {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or_else(|| format!("invalid Devfreq device path: {path}"))
}

fn thermal_limit_millicelsius() -> i64 {
    std::env::var("ARCH_MANAGER_THERMAL_LIMIT_MC")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(55_000)
}

fn ensure_thermal_safe_for_increase() -> Result<(), String> {
    let hottest = discovery::scan()
        .thermal_zones
        .into_iter()
        .filter_map(|zone| zone.temperature_millicelsius)
        .max();
    let limit = thermal_limit_millicelsius();
    if let Some(value) = hottest {
        if value >= limit {
            return Err(format!(
                "thermal guard blocked performance increase: {value} >= {limit} millicelsius"
            ));
        }
    }
    Ok(())
}

fn is_performance_governor(governor: &str) -> bool {
    governor.eq_ignore_ascii_case("performance")
        || governor.to_ascii_lowercase().contains("performance")
}

fn resolve_devfreq_path(device: &str) -> Result<PathBuf, String> {
    let name = Path::new(device)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "invalid Devfreq device".to_string())?;
    if name.is_empty()
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(format!("invalid Devfreq device: {device}"));
    }
    let path = PathBuf::from("/sys/class/devfreq").join(name);
    if !path.is_dir() {
        return Err(format!("Devfreq device does not exist: {name}"));
    }
    Ok(path)
}

fn resolve_devfreq_frequency_path(device: &Path, attribute: &str) -> Result<PathBuf, String> {
    let names = match attribute {
        "min_freq" => ["min_freq", "scaling_min_freq"],
        "max_freq" => ["max_freq", "scaling_max_freq"],
        _ => return Err(format!("invalid Devfreq frequency attribute: {attribute}")),
    };
    names
        .iter()
        .map(|name| device.join(name))
        .find(|path| path.is_file() && is_writable(path))
        .ok_or_else(|| format!("no writable Devfreq {attribute} interface found"))
}

fn validate_devfreq_frequency(
    device: &Path,
    attribute: &str,
    requested: u64,
) -> Result<(), String> {
    let available = read_required(&device.join("available_frequencies")).ok();
    if let Some(values) = available {
        let supported = values
            .split_whitespace()
            .filter_map(|value| value.parse::<u64>().ok())
            .any(|value| value == requested);
        if !supported {
            return Err(format!(
                "GPU frequency is not in the supported table: {requested}"
            ));
        }
    }
    let current_min = read_optional_first_u64(device, &["min_freq", "scaling_min_freq"]);
    let current_max = read_optional_first_u64(device, &["max_freq", "scaling_max_freq"]);
    match attribute {
        "min_freq" => {
            if let Some(maximum) = current_max {
                if requested > maximum {
                    return Err(format!(
                        "GPU minimum exceeds current maximum: {requested} > {maximum}"
                    ));
                }
            }
        }
        "max_freq" => {
            if let Some(minimum) = current_min {
                if requested < minimum {
                    return Err(format!(
                        "GPU maximum is below current minimum: {requested} < {minimum}"
                    ));
                }
            }
        }
        _ => return Err(format!("invalid Devfreq frequency attribute: {attribute}")),
    }
    Ok(())
}

fn read_optional_first_u64(path: &Path, names: &[&str]) -> Option<u64> {
    names
        .iter()
        .find_map(|name| read_required(&path.join(name)).ok()?.parse().ok())
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

fn is_writable(path: &Path) -> bool {
    fs::OpenOptions::new().write(true).open(path).is_ok()
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
    use super::{parse_frequency, resolve_devfreq_path, resolve_policy_path, validate_write_path};
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

    #[test]
    fn rejects_invalid_devfreq_names() {
        assert!(resolve_devfreq_path("gpu/device").is_err());
        assert!(resolve_devfreq_path("gpu$name").is_err());
    }
}
