use std::env;
use std::path::PathBuf;

#[derive(Clone)]
pub struct RuntimeConfig {
    pub root_dir: PathBuf,
    pub state_dir: PathBuf,
    pub log_file: PathBuf,
    pub lock_file: PathBuf,
    pub capabilities_file: PathBuf,
    pub baseline_file: PathBuf,
    pub profiles_dir: PathBuf,
}

impl RuntimeConfig {
    pub fn from_environment() -> Self {
        let root_dir = env::var_os("ARCH_MANAGER_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/data/adb/arch-manager"));
        let state_dir = root_dir.join("state");
        let profiles_dir = root_dir.join("profiles");

        Self {
            root_dir,
            log_file: state_dir.join("archctl.log"),
            lock_file: state_dir.join("archctl.lock"),
            capabilities_file: state_dir.join("capabilities.json"),
            baseline_file: state_dir.join("baseline.json"),
            profiles_dir,
            state_dir,
        }
    }
}
