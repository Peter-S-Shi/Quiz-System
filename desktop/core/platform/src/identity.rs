//! Stable application identity (ADR 0001 section 5.1). The identifier is permanent after first
//! release: the WebView profile path and installer upgrade identity depend on it.

pub const APP_IDENTIFIER: &str = "io.github.peter-s-shi.quiz-studio";
pub const PRODUCT_NAME: &str = "Quiz Studio";
/// Version of the shipped application (workspace version; the installer version is derived from the same source).
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
