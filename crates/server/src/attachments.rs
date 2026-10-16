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

#[utoipa::path(post,path="/api/v1/records/{record_id}/duplicate",params(("record_id"=Uuid,Path)),request_body=VersionCheck,responses((status=201,body=Record),(status=409,body=ApiError)))]
pub async fn duplicate(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<VersionCheck>,
) -> HttpResult<(axum::http::StatusCode, Json<Record>)> {
    let source = s.store.record(a, id).await?;
    if source.version != input.expected_version {
        return Err(form_persistence::StoreError::Conflict(Box::new(source)).into());
    }
    let schema = s.store.schema(a, source.form_id).await?;
    let mut copies = Vec::new();
    let result: HttpResult<Record> = async {
        for attachment in source.attachments.iter().filter(|a| {
            schema
                .fields
                .iter()
                .any(|f| f.id == a.field_id && f.archived_at.is_none())
        }) {
            let (_, key) = s.store.attachment(a, attachment.id).await?;
            let new = Uuid::new_v4();
            copies.push((attachment.id, new));
            tokio::fs::copy(
                s.config.storage.join(key),
                s.config.storage.join(new.to_string()),
            )
            .await?;
        }
        Ok(s.store
            .duplicate_record(a, id, input.expected_version, copies.clone())
            .await?)
    }
    .await;
    match result {
        Ok(record) => Ok((axum::http::StatusCode::CREATED, Json(record))),
        Err(error) => {
            for (_, new) in copies {
                if let Err(cleanup) =
                    tokio::fs::remove_file(s.config.storage.join(new.to_string())).await
                {
                    tracing::warn!("Duplicate cleanup failed: {cleanup}");
                }
            }
            Err(error)
        }
    }
}

#[utoipa::path(post,path="/api/v1/fields/{field_id}/duplicate",params(("field_id"=Uuid,Path)),responses((status=201,body=Field)))]
pub async fn duplicate_field(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
) -> HttpResult<(axum::http::StatusCode, Json<Field>)> {
    let files = s.store.field_attachments(a, id).await?;
    let mut copies = Vec::new();
    let result: HttpResult<Field> = async {
        for (old, key) in files {
            let new = Uuid::new_v4();
            copies.push((old, new));
            tokio::fs::copy(
                s.config.storage.join(key),
                s.config.storage.join(new.to_string()),
            )
            .await?;
        }
        Ok(s.store.duplicate_field(a, id, copies.clone()).await?)
    }
    .await;
    match result {
        Ok(field) => Ok((axum::http::StatusCode::CREATED, Json(field))),
        Err(error) => {
            for (_, new) in copies {
                if let Err(cleanup) =
                    tokio::fs::remove_file(s.config.storage.join(new.to_string())).await
                {
                    tracing::warn!("Field copy cleanup failed: {cleanup}");
                }
            }
            Err(error)
        }
    }
}
