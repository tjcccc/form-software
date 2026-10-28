use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use utoipa::ToSchema;
use uuid::Uuid;

pub type Values = BTreeMap<Uuid, Value>;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct User {
    pub id: Uuid,
    pub username: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SessionInfo {
    pub user: User,
    pub workspace: Workspace,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Login {
    pub username: String,
    pub password: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LoginResult {
    pub token: String,
    pub session: SessionInfo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FormKind {
    Standard,
    Options,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Form {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub key: String,
    pub name: String,
    pub description: String,
    pub kind: FormKind,
    pub icon: String,
    pub record_count: i64,
    pub archived_at: Option<DateTime<Utc>>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateForm {
    pub key: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "standard")]
    pub kind: FormKind,
    #[serde(default = "default_icon")]
    pub icon: String,
}
fn standard() -> FormKind {
    FormKind::Standard
}
fn default_icon() -> String {
    "table".into()
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateForm {
    pub name: Option<String>,
    pub description: Option<String>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FieldType {
    ShortText,
    LongText,
    Integer,
    Decimal,
    Boolean,
    Date,
    DateTime,
    Duration,
    Url,
    Relation,
    Attachment,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Cardinality {
    One,
    Many,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Presentation {
    Select,
    RecordPicker,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum NumberFormat {
    Plain,
    Currency,
    Percent,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RatingIcon {
    Star,
    Heart,
    ThumbsUp,
    Flag,
    Circle,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RatingColor {
    Ochre,
    Red,
    Purple,
    Blue,
    Green,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RatingConfig {
    pub max: u8,
    pub icon: RatingIcon,
    pub color: RatingColor,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FieldConfig {
    pub number_format: Option<NumberFormat>,
    pub decimal_places: Option<u8>,
    pub currency: Option<String>,
    pub rating: Option<RatingConfig>,
    pub target_form_id: Option<Uuid>,
    pub cardinality: Option<Cardinality>,
    pub presentation: Option<Presentation>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Field {
    #[serde(default)]
    pub description: String,
    pub id: Uuid,
    pub form_id: Uuid,
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: FieldType,
    pub required: bool,
    pub position: i32,
    pub config: FieldConfig,
    pub archived_at: Option<DateTime<Utc>>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateField {
    #[serde(default)]
    pub description: String,
    pub position: Option<i32>,
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: FieldType,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub config: FieldConfig,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateField {
    pub config: Option<FieldConfig>,
    pub description: Option<String>,
    pub name: Option<String>,
    pub position: Option<i32>,
    pub required: Option<bool>,
    pub archived: Option<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FormSchema {
    pub form: Form,
    pub fields: Vec<Field>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Record {
    pub id: Uuid,
    pub form_id: Uuid,
    #[schema(value_type = BTreeMap<String, serde_json::Value>)]
    pub values: Values,
    pub version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub attachments: Vec<Attachment>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateRecord {
    #[schema(value_type = BTreeMap<String, serde_json::Value>)]
    pub values: Values,
}
/// Create a validated record next to an existing record in manual table order.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct InsertRecord {
    #[schema(value_type = BTreeMap<String, serde_json::Value>)]
    pub values: Values,
    pub before: bool,
    pub expected_version: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateRecord {
    #[schema(value_type = BTreeMap<String, serde_json::Value>)]
    pub values: Values,
    pub expected_version: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct VersionCheck {
    pub expected_version: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Attachment {
    pub id: Uuid,
    pub field_id: Uuid,
    pub record_id: Uuid,
    pub filename: String,
    pub content_type: String,
    pub size_bytes: i64,
    pub sha256: String,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FilterOp {
    Eq,
    Ne,
    AnyOf,
    NoneOf,
    NotEmpty,
    Contains,
    Gt,
    Gte,
    Lt,
    Lte,
    Empty,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Filter {
    pub field_id: Uuid,
    pub op: FilterOp,
    pub value: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Sort {
    pub field_id: Uuid,
    pub descending: bool,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct RecordQuery {
    pub group_by: Option<Uuid>,
    pub q: Option<String>,
    pub filter: Option<String>,
    pub sort: Option<Uuid>,
    #[serde(default)]
    pub descending: bool,
    pub cursor: Option<u32>,
    pub limit: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RecordGroup {
    #[schema(value_type = serde_json::Value)]
    pub value: Value,
    pub count: i64,
}
fn freeze_default() -> bool {
    true
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RecordPage {
    #[serde(default)]
    pub groups: Vec<RecordGroup>,
    pub records: Vec<Record>,
    pub total: i64,
    pub next_cursor: Option<u32>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ViewConfig {
    pub group_by: Option<Uuid>,
    #[serde(default = "freeze_default")]
    pub freeze_first: bool,
    #[serde(default)]
    #[schema(required = true)]
    pub columns: Vec<ColumnLayout>,
    pub sort: Option<Sort>,
    #[serde(default)]
    #[schema(required = true)]
    pub filters: Vec<Filter>,
    /// Opening the view scrolls to its last row, for append-style logs.
    #[serde(default)]
    pub open_at_end: bool,
}
impl Default for ViewConfig {
    fn default() -> Self {
        Self {
            group_by: None,
            freeze_first: true,
            columns: vec![],
            sort: None,
            filters: vec![],
            open_at_end: false,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ColumnLayout {
    pub field_id: Uuid,
    pub width: u32,
    pub hidden: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct View {
    pub id: Uuid,
    pub form_id: Uuid,
    pub name: String,
    pub config: ViewConfig,
    pub is_default: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SaveView {
    pub name: String,
    pub config: ViewConfig,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateColumnWidth {
    pub width: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct FieldIssue {
    pub field_id: Option<Uuid>,
    pub message: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    pub issues: Vec<FieldIssue>,
    pub current: Option<Record>,
    /// Per-record problems from a batch write; empty for single-record operations.
    #[serde(default)]
    pub records: Vec<RecordIssue>,
}
/// A problem with one record in a batch write. Updates name their record; creates give their index in `creates`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RecordIssue {
    pub record_id: Option<Uuid>,
    pub create_index: Option<usize>,
    pub field_id: Option<Uuid>,
    pub message: String,
}
/// Most records one batch write may update and create together.
pub const MAX_BATCH_RECORDS: usize = 500;
/// One record update inside a batch write. Values merge into the record, as with a single update.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RecordPatch {
    pub record_id: Uuid,
    #[schema(value_type = BTreeMap<String, serde_json::Value>)]
    pub values: Values,
    pub expected_version: i32,
}
/// A record and the version a batch write expects it to have, for archiving or restoring it.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RecordVersion {
    pub record_id: Uuid,
    pub expected_version: i32,
}
/// Update, create, archive, and restore records of one form in a single transaction. Any validation failure or
/// version conflict rejects the whole write. Created records are appended to the end of manual order. Archiving
/// refuses records that active records still link to; restoring brings back an archived record unchanged.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WriteRecords {
    #[serde(default)]
    pub updates: Vec<RecordPatch>,
    #[serde(default)]
    pub creates: Vec<CreateRecord>,
    #[serde(default)]
    pub archives: Vec<RecordVersion>,
    #[serde(default)]
    pub restores: Vec<RecordVersion>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ArchivedRecord {
    pub id: Uuid,
    /// The archived record's new version, which a later restore expects.
    pub version: i32,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WrittenRecords {
    /// Updated records in request order.
    pub updated: Vec<Record>,
    /// Created records in request order.
    pub created: Vec<Record>,
    /// Archived records in request order.
    pub archived: Vec<ArchivedRecord>,
    /// Restored records in request order.
    pub restored: Vec<Record>,
}
/// Exact primary-name lookups in one target form, for pasted or imported relation text.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ResolveRecords {
    pub labels: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ResolvedLabel {
    pub label: String,
    /// Set only when exactly one active record has this primary name.
    pub record_id: Option<Uuid>,
    /// Number of active records with this primary name.
    pub matches: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportMapping {
    pub column: String,
    pub field_id: Uuid,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportRequest {
    pub form_id: Uuid,
    pub csv: String,
    pub mapping: Vec<ImportMapping>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ImportRow {
    pub row: usize,
    #[schema(value_type = BTreeMap<String, serde_json::Value>)]
    pub values: Values,
    pub issues: Vec<FieldIssue>,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ImportPreview {
    pub columns: Vec<String>,
    pub rows: Vec<ImportRow>,
    pub valid: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ImportResult {
    pub created: usize,
}
