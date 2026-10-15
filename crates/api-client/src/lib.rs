//! Shared authenticated HTTP client for CLI and native desktop. Never accesses PostgreSQL.
use form_domain::*;
use reqwest::{
    Method, StatusCode,
    blocking::{Client as HttpClient, RequestBuilder},
};
use serde::{Serialize, de::DeserializeOwned};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("{0}")]
    Http(#[from] reqwest::Error),
    #[error("{}", .body.message)]
    Api { status: u16, body: Box<ApiError> },
    #[error("{0}")]
    Invalid(String),
}
impl ClientError {
    pub fn status(&self) -> Option<u16> {
        if let Self::Api { status, .. } = self {
            Some(*status)
        } else {
            None
        }
    }
}
pub type Result<T> = std::result::Result<T, ClientError>;
#[derive(Clone)]
pub struct Client {
    http: HttpClient,
    base: String,
    token: Option<String>,
}
impl Client {
    pub fn new(base: &str, token: Option<String>) -> Result<Self> {
        let url = reqwest::Url::parse(base)
            .map_err(|_| ClientError::Invalid("Invalid server URL.".into()))?;
        if !["http", "https"].contains(&url.scheme())
            || url.username() != ""
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
        {
            return Err(ClientError::Invalid(
                "Use an HTTP(S) server origin without credentials, path, or query.".into(),
            ));
        }
        let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
        if url.scheme() != "https" && !local {
            return Err(ClientError::Invalid("Remote servers require HTTPS.".into()));
        }
        Ok(Self {
            http: HttpClient::builder()
                .timeout(std::time::Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            base: base.trim_end_matches('/').into(),
            token,
        })
    }
    fn request(&self, method: Method, path: &str) -> RequestBuilder {
        let builder = self
            .http
            .request(method, format!("{}/api/v1{path}", self.base));
        match &self.token {
            Some(token) => builder.bearer_auth(token),
            None => builder,
        }
    }
    fn decode<T: DeserializeOwned>(&self, builder: RequestBuilder) -> Result<T> {
        let response = builder.send()?;
        let status = response.status();
        if !status.is_success() {
            let body = response.json::<ApiError>().unwrap_or_else(|_| ApiError {
                code: "http".into(),
                message: format!("Server returned HTTP {}.", status.as_u16()),
                issues: vec![],
                current: None,
            });
            return Err(ClientError::Api {
                status: status.as_u16(),
                body: Box::new(body),
            });
        }
        Ok(response.json()?)
    }
    pub fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        self.decode(self.request(Method::GET, path))
    }
    pub fn post<T: DeserializeOwned>(&self, path: &str, body: &impl Serialize) -> Result<T> {
        self.decode(self.request(Method::POST, path).json(body))
    }
    pub fn patch<T: DeserializeOwned>(&self, path: &str, body: &impl Serialize) -> Result<T> {
        self.decode(self.request(Method::PATCH, path).json(body))
    }
    pub fn login(&self, input: &Login) -> Result<LoginResult> {
        self.post("/auth/login", input)
    }
    pub fn session(&self) -> Result<SessionInfo> {
        self.get("/workspaces/current")
    }
    pub fn forms(&self) -> Result<Vec<Form>> {
        self.get("/forms")
    }
    pub fn schema(&self, id: Uuid) -> Result<FormSchema> {
        self.get(&format!("/forms/{id}/schema"))
    }
    pub fn records(&self, id: Uuid, query: &RecordQuery) -> Result<RecordPage> {
        self.decode(
            self.request(Method::GET, &format!("/forms/{id}/records"))
                .query(query),
        )
    }
    pub fn record(&self, id: Uuid) -> Result<Record> {
        self.get(&format!("/records/{id}"))
    }
    pub fn create_record(&self, id: Uuid, values: Values) -> Result<Record> {
        self.post(&format!("/forms/{id}/records"), &CreateRecord { values })
    }
    pub fn update_record(&self, id: Uuid, values: Values, expected_version: i32) -> Result<Record> {
        self.patch(
            &format!("/records/{id}"),
            &UpdateRecord {
                values,
                expected_version,
            },
        )
    }
    pub fn archive_record(&self, id: Uuid, expected_version: i32) -> Result<()> {
        let response = self
            .request(Method::DELETE, &format!("/records/{id}"))
            .json(&VersionCheck { expected_version })
            .send()?;
        if response.status() == StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = response.status().as_u16();
            let body = response.json()?;
            Err(ClientError::Api {
                status,
                body: Box::new(body),
            })
        }
    }
    pub fn upload(
        &self,
        record_id: Uuid,
        field_id: Uuid,
        expected_version: i32,
        path: &std::path::Path,
    ) -> Result<Record> {
        let form = reqwest::blocking::multipart::Form::new()
            .file("file", path)
            .map_err(|e| ClientError::Invalid(e.to_string()))?;
        self.decode(
            self.request(Method::POST, &format!("/records/{record_id}/attachments"))
                .query(&[
                    ("field_id", field_id.to_string()),
                    ("expected_version", expected_version.to_string()),
                ])
                .multipart(form),
        )
    }
    pub fn download(&self, id: Uuid) -> Result<Vec<u8>> {
        let response = self
            .request(Method::GET, &format!("/attachments/{id}"))
            .send()?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.json()?;
            return Err(ClientError::Api {
                status,
                body: Box::new(body),
            });
        }
        Ok(response.bytes()?.to_vec())
    }
}
