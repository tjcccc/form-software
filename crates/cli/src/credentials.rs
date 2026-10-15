use form_api_client::{ClientError, Result};
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn entry(server: &str) -> Result<keyring::Entry> {
    keyring::Entry::new("FormSoftware", server.trim_end_matches('/')).map_err(|e| {
        ClientError::Invalid(format!(
            "Credential store unavailable: {e}. Supply FORM_TOKEN instead."
        ))
    })
}
pub fn save(server: &str, token: &str) -> Result<()> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        entry(server)?.set_password(token).map_err(|e| {
            ClientError::Invalid(format!(
                "Could not save token: {e}. Supply FORM_TOKEN for headless use."
            ))
        })
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (server, token);
        Err(ClientError::Invalid("Persistent login currently supports macOS and Windows. Supply FORM_TOKEN on this platform.".into()))
    }
}
pub fn load(server: &str) -> Result<String> {
    if let Ok(token) = std::env::var("FORM_TOKEN")
        && !token.is_empty()
    {
        return Ok(token);
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        entry(server)?.get_password().map_err(|_| {
            ClientError::Invalid("Sign in with formsw login, or supply FORM_TOKEN.".into())
        })
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = server;
        Err(ClientError::Invalid(
            "Supply FORM_TOKEN on this platform.".into(),
        ))
    }
}
