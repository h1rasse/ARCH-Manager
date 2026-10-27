use crate::config::RuntimeConfig;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

pub struct ProcessLock {
    path: std::path::PathBuf,
    file: Option<File>,
}

impl ProcessLock {
    pub fn acquire(config: &RuntimeConfig) -> io::Result<Self> {
        Self::acquire_path(&config.lock_file)
    }

    pub fn acquire_path(path: &Path) -> io::Result<Self> {
        let file = OpenOptions::new().write(true).create_new(true).open(path)?;
        Ok(Self {
            path: path.to_path_buf(),
            file: Some(file),
        })
    }
}

impl Drop for ProcessLock {
    fn drop(&mut self) {
        if let Some(mut file) = self.file.take() {
            let _ = file.flush();
        }
        let _ = fs::remove_file(&self.path);
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Baseline {
    pub values: BTreeMap<String, String>,
}

impl Baseline {
    pub fn load(path: &Path) -> io::Result<Self> {
        let content = fs::read_to_string(path)?;
        serde_json::from_str(&content).map_err(io::Error::other)
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        let content = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        fs::write(path, format!("{content}\n"))
    }
}
