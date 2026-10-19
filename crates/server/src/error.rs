use axum::{
    Json,
    extract::{FromRequest, Request},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use form_domain::ApiError;
use form_persistence::StoreError;
use serde::de::DeserializeOwned;
pub struct HttpError(pub StatusCode, pub Box<ApiError>);
pub type HttpResult<T> = Result<T, HttpError>;
impl HttpError {
    pub fn new(status: StatusCode, code: &str, message: impl Into<String>) -> Self {
        Self(
            status,
            Box::new(ApiError {
                code: code.into(),
                message: message.into(),
                issues: vec![],
                current: None,
            }),
        )
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNPROCESSABLE_ENTITY, "validation", message)
    }
    pub fn internal(error: impl std::fmt::Display) -> Self {
        tracing::error!("Internal operation failed: {error}");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "The operation failed. Please try again.",
        )
    }
}
impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        (self.0, Json(self.1)).into_response()
    }
}
impl From<StoreError> for HttpError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::NotFound => Self::new(StatusCode::NOT_FOUND, "not_found", "This resource is unavailable."),
            StoreError::Invalid(message) => Self::invalid(message),
            StoreError::Validation(issues) => Self(
                StatusCode::UNPROCESSABLE_ENTITY,
                Box::new(ApiError {
                    code: "validation".into(),
                    message: "Some fields need attention.".into(),
                    issues,
                    current: None,
                }),
            ),
            StoreError::Conflict(current) => Self(
                StatusCode::CONFLICT,
                Box::new(ApiError {
                    code: "conflict".into(),
                    message: "This record has changed. Review the latest version before saving again.".into(),
                    issues: vec![],
                    current: Some(*current),
                }),
            ),
            StoreError::Database(sqlx::Error::Database(ref e)) if e.is_unique_violation() => {
                Self::invalid("This key or name is already in use.")
            }
            other => Self::internal(other),
        }
    }
}
impl From<sqlx::Error> for HttpError {
    fn from(e: sqlx::Error) -> Self {
        StoreError::Database(e).into()
    }
}
impl From<std::io::Error> for HttpError {
    fn from(e: std::io::Error) -> Self {
        Self::internal(e)
    }
}
/// Normalize JSON extraction failures into the same machine-readable error envelope.
pub struct ApiJson<T>(pub T);
impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = HttpError;
    async fn from_request(req: Request, state: &S) -> HttpResult<Self> {
        Json::<T>::from_request(req, state)
            .await
            .map(|Json(value)| Self(value))
            .map_err(|e| HttpError::new(e.status(), "invalid_json", e.body_text()))
    }
}
