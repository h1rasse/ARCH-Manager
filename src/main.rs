mod adaptive;
mod app;
mod config;
mod core;
mod discovery;
mod logging;
mod network;
mod profiles;
mod scheduler;
mod state;

use app::Application;
use config::RuntimeConfig;
use std::process::ExitCode;

fn main() -> ExitCode {
    let config = RuntimeConfig::from_environment();
    let application = Application::new(config);

    match application.run(std::env::args().skip(1).collect()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::FAILURE
        }
    }
}
