use crate::config::RuntimeConfig;
use crate::discovery;
use crate::logging;
use crate::state::{Baseline, ProcessLock};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::Path;

pub struct Application {
    config: RuntimeConfig,
}

impl Application {
    pub fn new(config: RuntimeConfig) -> Self {
        Self { config }
    }

    pub fn run(&self, arguments: Vec<String>) -> Result<(), String> {
        self.prepare().map_err(|error| error.to_string())?;
        match arguments.first().map(String::as_str) {
            Some("capture") => self.capture(),
            Some("scan") => self.scan(),
            Some("status") => self.status(),
            Some("restore") => self.restore(),
            Some("help") | None => {
                Self::print_help();
                Ok(())
            }
            Some(command) => Err(format!("unknown command: {command}")),
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

    fn status(&self) -> Result<(), String> {
        let content = fs::read_to_string(&self.config.capabilities_file)
            .map_err(|error| error.to_string())?;
        let value: Value = serde_json::from_str(&content).map_err(|error| error.to_string())?;
        println!(
            "{}",
            serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?
        );
        Ok(())
    }

    fn restore(&self) -> Result<(), String> {
        let _lock = ProcessLock::acquire(&self.config).map_err(lock_error)?;
        let baseline =
            Baseline::load(&self.config.baseline_file).map_err(|error| error.to_string())?;
        for (path, value) in baseline.values {
            validate_write_path(Path::new(&path))?;
            fs::write(&path, value.as_bytes())
                .map_err(|error| format!("failed to restore {path}: {error}"))?;
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
        println!("  archctl capture");
        println!("  archctl scan");
        println!("  archctl status");
        println!("  archctl restore");
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
    use super::validate_write_path;
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
}
