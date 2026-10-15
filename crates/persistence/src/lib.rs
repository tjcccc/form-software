//! PostgreSQL-backed application operations. Transactions enforce schema and record invariants.
mod attachments;
mod records;
mod schema;
mod seed;
mod views;
use form_domain::*;
pub use seed::seed_demo;
use serde::de::DeserializeOwned;
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone, Copy)]
pub struct Actor {
    pub user_id: Uuid,
    pub workspace_id: Uuid,
}
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Resource not found.")]
    NotFound,
    #[error("{0}")]
    Invalid(String),
    #[error("Some fields need attention.")]
    Validation(Vec<FieldIssue>),
    #[error("This record changed since you opened it.")]
    Conflict(Box<Record>),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, StoreError>;
#[derive(Clone)]
pub struct Store {
    pub pool: PgPool,
}
impl Store {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
    pub async fn migrate(&self) -> std::result::Result<(), sqlx::migrate::MigrateError> {
        sqlx::migrate!("./migrations").run(&self.pool).await
    }
    pub async fn session_info(&self, actor: Actor) -> Result<SessionInfo> {
        let row = sqlx::query("SELECT jsonb_build_object('id', u.id, 'username', u.username) AS usr, to_jsonb(w) AS ws FROM users u JOIN workspace_memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id WHERE u.id=$1 AND w.id=$2")
            .bind(actor.user_id).bind(actor.workspace_id).fetch_optional(&self.pool).await?.ok_or(StoreError::NotFound)?;
        Ok(SessionInfo {
            user: decode(&row, "usr")?,
            workspace: decode(&row, "ws")?,
        })
    }
    pub(crate) async fn lock_form(
        tx: &mut Transaction<'_, Postgres>,
        actor: Actor,
        form_id: Uuid,
    ) -> Result<()> {
        sqlx::query("SELECT id FROM forms WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL FOR UPDATE")
            .bind(form_id).bind(actor.workspace_id).fetch_optional(&mut **tx).await?.ok_or(StoreError::NotFound)?;
        Ok(())
    }
}
pub(crate) fn decode<T: DeserializeOwned>(row: &sqlx::postgres::PgRow, name: &str) -> Result<T> {
    Ok(serde_json::from_value(row.try_get(name)?)?)
}
pub(crate) fn encode<T: serde::Serialize>(value: T) -> Result<serde_json::Value> {
    Ok(serde_json::to_value(value)?)
}
pub(crate) fn invalid(message: impl Into<String>) -> StoreError {
    StoreError::Invalid(message.into())
}
pub(crate) fn checked(result: std::result::Result<(), String>) -> Result<()> {
    result.map_err(StoreError::Invalid)
}
pub(crate) fn issues(result: Vec<FieldIssue>) -> Result<()> {
    if result.is_empty() {
        Ok(())
    } else {
        Err(StoreError::Validation(result))
    }
}
