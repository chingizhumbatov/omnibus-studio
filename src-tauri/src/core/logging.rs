use std::path::PathBuf;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Layer,
};

/// Initializes the multi-target logging system (Console + Rolling File).
/// Should be called exactly once at application startup.
///
/// `log_dir` specifies where the rotated log files will be written
/// (usually the OS-specific AppData directory).
pub fn init_logging(log_dir: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Console Layer (stdout) for developers
    // By default, filter at INFO level unless RUST_LOG environment variable is set
    let console_layer = fmt::layer()
        .with_target(true)
        .with_span_events(FmtSpan::CLOSE)
        .with_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")));

    // 2. Rolling File Layer for production logs (rotated daily)
    let file_appender = RollingFileAppender::new(Rotation::DAILY, log_dir, "omnibus-studio.log");
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false) // No color codes in the plain text log files
        .with_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")));

    // Combine layers and initialize the global subscriber
    tracing_subscriber::registry()
        .with(console_layer)
        .with(file_layer)
        .init();

    tracing::info!("Omnibus Studio structured logging initialized.");
    Ok(())
}
