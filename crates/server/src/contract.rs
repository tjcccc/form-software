use form_domain::*;
use utoipa::{
    Modify, OpenApi,
    openapi::security::{ApiKey, ApiKeyValue, Http, HttpAuthScheme, SecurityScheme},
};
#[derive(OpenApi)]
#[openapi(
    info(title="FormSoftware API",version="0.8.0",description="Workspace-scoped structured records. All data routes require an owner session or bearer token. Decimal values are exact strings; durations are integer minutes; scalar/relation values use immutable field UUID keys. PATCH merges supplied values. Archive retains data. A 409 response includes the current record."),
    paths(crate::auth::login,crate::auth::logout,crate::auth::session,crate::routes::forms,crate::routes::create_form,crate::routes::schema,crate::routes::update_form,crate::routes::create_field,crate::routes::update_field,crate::routes::records,crate::routes::create_record,crate::routes::insert_record,crate::routes::write_records,crate::routes::resolve_records,crate::attachments::duplicate,crate::attachments::duplicate_field,crate::routes::record,crate::routes::update_record,crate::routes::archive_record,crate::routes::views,crate::routes::save_view,crate::routes::update_column_width,crate::attachments::upload,crate::attachments::download,crate::attachments::remove,crate::imports::preview,crate::imports::commit),
    components(schemas(User,Workspace,SessionInfo,Login,LoginResult,Form,FormKind,CreateForm,UpdateForm,Field,FieldType,FieldConfig,Cardinality,Presentation,CreateField,UpdateField,FormSchema,Record,CreateRecord,InsertRecord,UpdateRecord,VersionCheck,Attachment,Filter,FilterOp,Sort,RecordGroup,RecordPage,ViewConfig,ColumnLayout,Summary,View,SaveView,UpdateColumnWidth,FieldIssue,ApiError,RecordIssue,RecordPatch,WriteRecords,WrittenRecords,ResolveRecords,ResolvedLabel,ImportMapping,ImportRequest,ImportRow,ImportPreview,ImportResult)),
    modifiers(&Security),
)]
pub struct ApiDoc;
struct Security;
impl Modify for Security {
    fn modify(&self, doc: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = doc.components.as_mut() {
            components.add_security_scheme("bearer", SecurityScheme::Http(Http::new(HttpAuthScheme::Bearer)));
            components.add_security_scheme(
                "session",
                SecurityScheme::ApiKey(ApiKey::Cookie(ApiKeyValue::new("formsw_session"))),
            );
        }
        for (path, item) in &mut doc.paths.paths {
            if path == "/api/v1/auth/login" {
                continue;
            }
            let security = vec![
                utoipa::openapi::security::SecurityRequirement::new("bearer", Vec::<String>::new()),
                utoipa::openapi::security::SecurityRequirement::new("session", Vec::<String>::new()),
            ];
            for operation in [&mut item.get, &mut item.post, &mut item.patch, &mut item.delete]
                .into_iter()
                .flatten()
            {
                operation.security = Some(security.clone());
            }
        }
    }
}
