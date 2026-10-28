use crate::{AppState, error::*};
use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use form_domain::*;
use form_persistence::Actor;
use std::sync::Arc;
use uuid::Uuid;

#[utoipa::path(get,path="/api/v1/forms",responses((status=200,body=Vec<Form>)))]
pub async fn forms(State(s): State<Arc<AppState>>, Extension(a): Extension<Actor>) -> HttpResult<Json<Vec<Form>>> {
    Ok(Json(s.store.forms(a).await?))
}
#[utoipa::path(post,path="/api/v1/forms",request_body=CreateForm,responses((status=201,body=FormSchema)))]
pub async fn create_form(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    ApiJson(input): ApiJson<CreateForm>,
) -> HttpResult<(StatusCode, Json<FormSchema>)> {
    Ok((StatusCode::CREATED, Json(s.store.create_form(a, input).await?)))
}
#[utoipa::path(get,path="/api/v1/forms/{form_id}/schema",params(("form_id"=Uuid,Path)),responses((status=200,body=FormSchema)))]
pub async fn schema(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
) -> HttpResult<Json<FormSchema>> {
    Ok(Json(s.store.schema(a, id).await?))
}
#[utoipa::path(patch,path="/api/v1/forms/{form_id}",params(("form_id"=Uuid,Path)),request_body=UpdateForm,responses((status=200,body=Form)))]
pub async fn update_form(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<UpdateForm>,
) -> HttpResult<Json<Form>> {
    Ok(Json(s.store.update_form(a, id, input).await?))
}
#[utoipa::path(post,path="/api/v1/forms/{form_id}/fields",params(("form_id"=Uuid,Path)),request_body=CreateField,responses((status=201,body=Field)))]
pub async fn create_field(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<CreateField>,
) -> HttpResult<(StatusCode, Json<Field>)> {
    Ok((StatusCode::CREATED, Json(s.store.create_field(a, id, input).await?)))
}
#[utoipa::path(patch,path="/api/v1/fields/{field_id}",params(("field_id"=Uuid,Path)),request_body=UpdateField,responses((status=200,body=Field)))]
pub async fn update_field(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<UpdateField>,
) -> HttpResult<Json<Field>> {
    Ok(Json(s.store.update_field(a, id, input).await?))
}
#[utoipa::path(get,path="/api/v1/forms/{form_id}/records",params(("form_id"=Uuid,Path),("q"=Option<String>,Query),("filter"=Option<String>,Query,description="JSON array of Filter predicates, combined with AND"),("sort"=Option<Uuid>,Query),("group_by"=Option<Uuid>,Query),("descending"=Option<bool>,Query),("cursor"=Option<u32>,Query),("limit"=Option<u32>,Query)),responses((status=200,body=RecordPage)))]
pub async fn records(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    Query(query): Query<RecordQuery>,
) -> HttpResult<Json<RecordPage>> {
    Ok(Json(s.store.records(a, id, query).await?))
}
#[utoipa::path(post,path="/api/v1/forms/{form_id}/records",params(("form_id"=Uuid,Path)),request_body=CreateRecord,responses((status=201,body=Record),(status=422,body=ApiError)))]
pub async fn create_record(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<CreateRecord>,
) -> HttpResult<(StatusCode, Json<Record>)> {
    Ok((StatusCode::CREATED, Json(s.store.create_record(a, id, input).await?)))
}
#[utoipa::path(get,path="/api/v1/records/{record_id}",params(("record_id"=Uuid,Path)),responses((status=200,body=Record)))]
pub async fn record(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
) -> HttpResult<Json<Record>> {
    Ok(Json(s.store.record(a, id).await?))
}
#[utoipa::path(patch,path="/api/v1/records/{record_id}",params(("record_id"=Uuid,Path)),request_body=UpdateRecord,responses((status=200,body=Record),(status=409,body=ApiError)))]
pub async fn update_record(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<UpdateRecord>,
) -> HttpResult<Json<Record>> {
    Ok(Json(s.store.update_record(a, id, input).await?))
}
#[utoipa::path(post,path="/api/v1/forms/{form_id}/records/batch",params(("form_id"=Uuid,Path)),request_body=WriteRecords,responses((status=200,body=WrittenRecords),(status=409,body=ApiError),(status=422,body=ApiError)))]
pub async fn write_records(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<WriteRecords>,
) -> HttpResult<Json<WrittenRecords>> {
    Ok(Json(s.store.write_records(a, id, input).await?))
}
#[utoipa::path(post,path="/api/v1/forms/{form_id}/records/resolve",params(("form_id"=Uuid,Path)),request_body=ResolveRecords,responses((status=200,body=Vec<ResolvedLabel>)))]
pub async fn resolve_records(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<ResolveRecords>,
) -> HttpResult<Json<Vec<ResolvedLabel>>> {
    Ok(Json(s.store.resolve_labels(a, id, input.labels).await?))
}
#[utoipa::path(delete,path="/api/v1/records/{record_id}",params(("record_id"=Uuid,Path)),request_body=VersionCheck,responses((status=204),(status=409,body=ApiError)))]
pub async fn archive_record(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<VersionCheck>,
) -> HttpResult<StatusCode> {
    s.store.archive_record(a, id, input.expected_version).await?;
    Ok(StatusCode::NO_CONTENT)
}
#[utoipa::path(get,path="/api/v1/forms/{form_id}/views",params(("form_id"=Uuid,Path)),responses((status=200,body=Vec<View>)))]
pub async fn views(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
) -> HttpResult<Json<Vec<View>>> {
    Ok(Json(s.store.views(a, id).await?))
}
#[utoipa::path(post,path="/api/v1/forms/{form_id}/views",params(("form_id"=Uuid,Path)),request_body=SaveView,responses((status=200,body=View)))]
pub async fn save_view(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<SaveView>,
) -> HttpResult<Json<View>> {
    Ok(Json(s.store.save_view(a, id, input).await?))
}

#[utoipa::path(post,path="/api/v1/records/{record_id}/insert",params(("record_id"=Uuid,Path)),request_body=InsertRecord,responses((status=201,body=Record),(status=409,body=ApiError)))]
pub async fn insert_record(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path(id): Path<Uuid>,
    ApiJson(input): ApiJson<InsertRecord>,
) -> HttpResult<(StatusCode, Json<Record>)> {
    Ok((StatusCode::CREATED, Json(s.store.insert_record(a, id, input).await?)))
}

#[utoipa::path(patch,path="/api/v1/views/{view_id}/columns/{field_id}/width",params(("view_id"=Uuid,Path),("field_id"=Uuid,Path)),request_body=UpdateColumnWidth,responses((status=200,body=View),(status=404,body=ApiError),(status=422,body=ApiError)))]
pub async fn update_column_width(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    Path((view_id, field_id)): Path<(Uuid, Uuid)>,
    ApiJson(input): ApiJson<UpdateColumnWidth>,
) -> HttpResult<Json<View>> {
    Ok(Json(s.store.update_column_width(a, view_id, field_id, input).await?))
}
