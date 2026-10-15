use crate::{AppState, error::*};
use axum::{
    Extension, Json,
    extract::{Multipart, Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
};
use form_domain::*;
use form_persistence::Actor;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;
#[derive(Deserialize)]
pub struct UploadQuery {
    field_id: Uuid,
    expected_version: i32,
}
#[utoipa::path(post,path="/api/v1/records/{record_id}/attachments",params(("record_id"=Uuid,Path),("field_id"=Uuid,Query),("expected_version"=i32,Query)),request_body(content=String,content_type="multipart/form-data"),responses((status=200,body=Record)))]
pub async fn upload(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    Query(query): Query<UploadQuery>,
    mut multipart: Multipart,
) -> HttpResult<Json<Record>> {
    s.store.record(a, id).await?;
    let field = multipart
        .next_field()
        .await
        .map_err(|_| HttpError::invalid("Invalid upload."))?
        .ok_or_else(|| HttpError::invalid("Choose a file to upload."))?;
    let filename = field
        .file_name()
        .unwrap_or("attachment")
        .split(['/', '\\'])
        .next_back()
        .unwrap_or("attachment")
        .chars()
        .filter(|c| !c.is_control())
        .take(200)
        .collect::<String>();
    let bytes = field
        .bytes()
        .await
        .map_err(|_| HttpError::invalid("File exceeds the 10 MB upload limit."))?;
    if bytes.len() > 10 * 1024 * 1024 {
        return Err(HttpError::invalid("File exceeds the 10 MB upload limit."));
    }
    // Downloads are forced attachments with nosniff; never trust user-supplied MIME types.
    let attachment = Attachment {
        id: Uuid::new_v4(),
        record_id: id,
        field_id: query.field_id,
        filename,
        content_type: "application/octet-stream".into(),
        size_bytes: bytes.len() as i64,
        sha256: format!("{:x}", Sha256::digest(&bytes)),
    };
    let key = attachment.id.to_string();
    let path = s.config.storage.join(&key);
    tokio::fs::write(&path, &bytes).await?;
    match s
        .store
        .add_attachment(a, attachment, &key, query.expected_version)
        .await
    {
        Ok(record) => Ok(Json(record)),
        Err(error) => {
            if let Err(cleanup) = tokio::fs::remove_file(path).await {
                tracing::error!("Upload cleanup failed: {cleanup}");
            }
            Err(error.into())
        }
    }
}
#[utoipa::path(get,path="/api/v1/attachments/{attachment_id}",params(("attachment_id"=Uuid,Path)),responses((status=200,content_type="application/octet-stream")))]
pub async fn download(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
) -> HttpResult<Response> {
    let (attachment, key) = s.store.attachment(a, id).await?;
    let bytes = tokio::fs::read(s.config.storage.join(key)).await?;
    let encoded = attachment
        .filename
        .as_bytes()
        .iter()
        .map(|b| format!("%{b:02X}"))
        .collect::<String>();
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream".into()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"download\"; filename*=UTF-8''{encoded}"),
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".into()),
            (header::CACHE_CONTROL, "private, no-store".into()),
        ],
        bytes,
    )
        .into_response())
}
#[utoipa::path(delete,path="/api/v1/attachments/{attachment_id}",params(("attachment_id"=Uuid,Path)),request_body=VersionCheck,responses((status=200,body=Record)))]
pub async fn remove(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<VersionCheck>,
) -> HttpResult<Json<Record>> {
    let (_, key) = s.store.attachment(a, id).await?;
    let record = s
        .store
        .remove_attachment(a, id, input.expected_version)
        .await?;
    // Deletion is committed first; unreachable files can be safely reconciled later.
    if let Err(error) = tokio::fs::remove_file(s.config.storage.join(key)).await {
        tracing::warn!("Attachment cleanup failed: {error}");
    }
    Ok(Json(record))
}
