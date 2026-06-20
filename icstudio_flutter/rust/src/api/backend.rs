#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendStatus {
    pub service_name: String,
    pub version: String,
    pub bridge_ready: bool,
}

#[flutter_rust_bridge::frb(sync)]
pub fn get_backend_status() -> BackendStatus {
    BackendStatus {
        service_name: "ICStudio Rust Core".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        bridge_ready: true,
    }
}

#[flutter_rust_bridge::frb(init)]
pub fn init_app() {
    flutter_rust_bridge::setup_default_user_utils();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_ready_backend_status() {
        assert_eq!(
            get_backend_status(),
            BackendStatus {
                service_name: "ICStudio Rust Core".to_string(),
                version: "0.1.0".to_string(),
                bridge_ready: true,
            }
        );
    }
}
