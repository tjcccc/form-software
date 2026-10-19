use std::{net::SocketAddr, path::PathBuf};
pub struct Config {
    pub database_url: String,
    pub bind: SocketAddr,
    pub origin: String,
    pub username: String,
    pub password: Option<String>,
    pub seed_demo: bool,
    pub storage: PathBuf,
    pub secure_cookie: bool,
}
impl Config {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let origin = std::env::var("FORM_ORIGIN").unwrap_or_else(|_| "http://127.0.0.1:5173".into());
        if origin.ends_with('/') || !(origin.starts_with("http://") || origin.starts_with("https://")) {
            return Err("FORM_ORIGIN must be an HTTP(S) origin without a trailing slash".into());
        }
        Ok(Self {
            database_url: std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required; run pnpm dev:setup")?,
            bind: std::env::var("FORM_BIND")
                .unwrap_or_else(|_| "127.0.0.1:3141".into())
                .parse()?,
            origin,
            username: std::env::var("FORM_USERNAME").unwrap_or_else(|_| "owner".into()),
            password: std::env::var("FORM_PASSWORD").ok(),
            seed_demo: std::env::var("FORM_SEED_DEMO").is_ok_and(|s| s == "true"),
            storage: std::env::var_os("FORM_STORAGE")
                .map(PathBuf::from)
                .unwrap_or_else(|| ".local/attachments".into()),
            secure_cookie: std::env::var("FORM_SECURE_COOKIE").is_ok_and(|s| s == "true"),
        })
    }
}
