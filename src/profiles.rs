use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Profile {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub cpu_governor: Option<String>,
    #[serde(default)]
    pub cpu_min_freq: Option<u64>,
    #[serde(default)]
    pub cpu_max_freq: Option<u64>,
    #[serde(default)]
    pub gpu_governor: Option<String>,
    #[serde(default)]
    pub gpu_min_freq: Option<u64>,
    #[serde(default)]
    pub gpu_max_freq: Option<u64>,
}

pub fn builtin_profiles() -> Vec<Profile> {
    vec![
        Profile {
            name: "stock".to_string(),
            description: "Restore values captured before ARCH Manager changes".to_string(),
            cpu_governor: None,
            cpu_min_freq: None,
            cpu_max_freq: None,
            gpu_governor: None,
            gpu_min_freq: None,
            gpu_max_freq: None,
        },
        Profile {
            name: "balanced".to_string(),
            description: "Use schedutil where the kernel exposes it".to_string(),
            cpu_governor: Some("schedutil".to_string()),
            cpu_min_freq: None,
            cpu_max_freq: None,
            gpu_governor: None,
            gpu_min_freq: None,
            gpu_max_freq: None,
        },
        Profile {
            name: "battery".to_string(),
            description: "Use powersave where the kernel exposes it".to_string(),
            cpu_governor: Some("powersave".to_string()),
            cpu_min_freq: None,
            cpu_max_freq: None,
            gpu_governor: None,
            gpu_min_freq: None,
            gpu_max_freq: None,
        },
        Profile {
            name: "performance".to_string(),
            description: "Use performance governor where supported and thermally safe".to_string(),
            cpu_governor: Some("performance".to_string()),
            cpu_min_freq: None,
            cpu_max_freq: None,
            gpu_governor: Some("performance".to_string()),
            gpu_min_freq: None,
            gpu_max_freq: None,
        },
        Profile {
            name: "gaming".to_string(),
            description: "Use performance governor and the highest kernel-reported CPU/GPU frequencies where available; thermal guard stays active".to_string(),
            cpu_governor: Some("performance".to_string()),
            cpu_min_freq: None,
            cpu_max_freq: None,
            gpu_governor: Some("performance".to_string()),
            gpu_min_freq: None,
            gpu_max_freq: None,
        },
    ]
}

pub fn load(name: &str, directory: &Path) -> Result<Profile, String> {
    if let Some(profile) = builtin_profiles()
        .into_iter()
        .find(|profile| profile.name == name)
    {
        return Ok(profile);
    }
    let path = profile_path(name, directory)?;
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("failed to read profile {}: {error}", path.display()))?;
    let profile: Profile = serde_json::from_str(&content)
        .map_err(|error| format!("failed to parse profile {}: {error}", path.display()))?;
    if profile.name != name {
        return Err(format!(
            "profile name mismatch: expected {name}, got {}",
            profile.name
        ));
    }
    Ok(profile)
}

pub fn custom_names(directory: &Path) -> Vec<String> {
    fs::read_dir(directory)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter_map(|entry| {
                    let path = entry.path();
                    if path.extension().and_then(|value| value.to_str()) == Some("json") {
                        path.file_stem()
                            .map(|value| value.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn profile_path(name: &str, directory: &Path) -> Result<PathBuf, String> {
    if name.is_empty()
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
    {
        return Err(format!("invalid profile name: {name}"));
    }
    Ok(directory.join(format!("{name}.json")))
}
