use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Auto,
    Performance,
    Battery,
    Strict,
}

impl Mode {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "auto" => Ok(Self::Auto),
            "performance" => Ok(Self::Performance),
            "battery" => Ok(Self::Battery),
            "strict" => Ok(Self::Strict),
            _ => Err(format!("invalid adaptive mode: {value}")),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Performance => "performance",
            Self::Battery => "battery",
            Self::Strict => "strict",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScreenState {
    On,
    Off,
    Unknown,
}

pub fn load_mode(path: &Path) -> Result<Mode, String> {
    if !path.is_file() {
        return Ok(Mode::Auto);
    }
    let value = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Mode::parse(value.trim())
}

pub fn save_mode(path: &Path, mode: &Mode) -> Result<(), String> {
    fs::write(path, format!("{}\n", mode.as_str())).map_err(|error| error.to_string())
}

pub fn screen_state() -> ScreenState {
    let output = Command::new("dumpsys").arg("power").output();
    if let Ok(output) = output {
        let value = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
        if value.contains("mwakefulness=awake")
            || value.contains("display power: state=on")
            || value.contains("mscreenon=true")
        {
            return ScreenState::On;
        }
        if value.contains("mwakefulness=asleep")
            || value.contains("mwakefulness=dozing")
            || value.contains("display power: state=off")
            || value.contains("mscreenon=false")
        {
            return ScreenState::Off;
        }
    }
    ScreenState::Unknown
}

pub fn target_profile(mode: &Mode, state: ScreenState) -> Option<&'static str> {
    match mode {
        Mode::Auto => match state {
            ScreenState::On => Some("balanced"),
            ScreenState::Off => Some("stock"),
            ScreenState::Unknown => None,
        },
        Mode::Performance => Some("performance"),
        Mode::Battery => match state {
            ScreenState::On => Some("battery"),
            ScreenState::Off => Some("stock"),
            ScreenState::Unknown => None,
        },
        Mode::Strict => Some("stock"),
    }
}

pub fn screen_state_name(state: ScreenState) -> &'static str {
    match state {
        ScreenState::On => "on",
        ScreenState::Off => "off",
        ScreenState::Unknown => "unknown",
    }
}
