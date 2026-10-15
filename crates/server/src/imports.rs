use crate::{AppState, error::*};
use axum::{Extension, Json, extract::State};
use form_domain::*;
use form_persistence::Actor;
use serde_json::{Value, json};
use std::{collections::HashSet, sync::Arc};
use uuid::Uuid;
async fn prepare(s: &AppState, a: Actor, input: &ImportRequest) -> HttpResult<ImportPreview> {
    if input.csv.len() > 1024 * 1024 {
        return Err(HttpError::invalid(
            "CSV imports are limited to 1 MB and 500 records.",
        ));
    }
    let schema = s.store.schema(a, input.form_id).await?;
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .from_reader(input.csv.as_bytes());
    let headers = reader
        .headers()
        .map_err(|_| HttpError::invalid("Could not read CSV headers."))?
        .clone();
    let mut seen_columns = HashSet::new();
    if headers
        .iter()
        .any(|h| h.is_empty() || !seen_columns.insert(h))
    {
        return Err(HttpError::invalid(
            "CSV headers must be nonempty and unique.",
        ));
    }
    let columns = headers.iter().map(str::to_owned).collect::<Vec<_>>();
    let mut field_ids = HashSet::new();
    let mut mapped_columns = HashSet::new();
    let mut mappings = Vec::new();
    for mapping in &input.mapping {
        let field = schema
            .fields
            .iter()
            .find(|f| {
                f.id == mapping.field_id
                    && f.archived_at.is_none()
                    && f.field_type != FieldType::Attachment
            })
            .ok_or_else(|| HttpError::invalid("Mapping includes an unavailable field."))?;
        let index = headers
            .iter()
            .position(|h| h == mapping.column)
            .ok_or_else(|| HttpError::invalid("Mapped CSV column does not exist."))?;
        if !field_ids.insert(field.id) || !mapped_columns.insert(index) {
            return Err(HttpError::invalid(
                "Each column and field can only be mapped once.",
            ));
        }
        mappings.push((index, field));
    }
    let mut rows = Vec::new();
    for (index, line) in reader.records().enumerate() {
        if index >= 500 {
            return Err(HttpError::invalid(
                "CSV imports are limited to 500 records.",
            ));
        }
        let line = line.map_err(|e| HttpError::invalid(format!("CSV row {}: {e}", index + 2)))?;
        let mut values = Values::new();
        let mut issues = Vec::new();
        for (column, field) in &mappings {
            let raw = line.get(*column).unwrap_or("");
            let parsed = parse_value(s, a, field, raw).await;
            match parsed {
                Ok(value) => {
                    values.insert(field.id, value);
                }
                Err(message) => issues.push(FieldIssue {
                    field_id: Some(field.id),
                    message,
                }),
            }
        }
        if issues.is_empty() {
            issues.extend(
                s.store
                    .validate_record_input(a, input.form_id, &values)
                    .await?,
            );
        }
        rows.push(ImportRow {
            row: index + 2,
            values,
            issues,
        });
    }
    let valid = !rows.is_empty() && rows.iter().all(|r| r.issues.is_empty());
    Ok(ImportPreview {
        columns,
        rows,
        valid,
    })
}
async fn parse_value(s: &AppState, a: Actor, field: &Field, raw: &str) -> Result<Value, String> {
    if raw.is_empty() {
        return Ok(Value::Null);
    }
    match field.field_type {
        FieldType::Integer | FieldType::Duration => raw
            .parse::<i64>()
            .map(|n| json!(n))
            .map_err(|_| "Use whole numbers; durations are minutes.".into()),
        FieldType::Boolean => match raw.to_ascii_lowercase().as_str() {
            "true" | "1" => Ok(json!(true)),
            "false" | "0" => Ok(json!(false)),
            _ => Err("Use true or false.".into()),
        },
        FieldType::Relation => {
            let target = field
                .config
                .target_form_id
                .ok_or("Missing relation target.")?;
            let schema = s.store.schema(a, target).await.map_err(|e| e.to_string())?;
            let name = schema
                .fields
                .iter()
                .find(|f| f.key == "name")
                .ok_or("Target has no Name field.")?;
            let mut ids = Vec::new();
            for label in raw.split('|').map(str::trim) {
                if let Ok(id) = Uuid::parse_str(label) {
                    ids.push(id);
                    continue;
                }
                let filter = serde_json::to_string(&vec![Filter {
                    field_id: name.id,
                    op: FilterOp::Eq,
                    value: json!(label),
                }])
                .map_err(|e| e.to_string())?;
                let page = s
                    .store
                    .records(
                        a,
                        target,
                        RecordQuery {
                            filter: Some(filter),
                            limit: Some(2),
                            ..Default::default()
                        },
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                if page.total != 1 {
                    return Err(format!(
                        "Relation '{label}' needs exactly one existing match (found {}). Use a record UUID to disambiguate.",
                        page.total
                    ));
                }
                ids.push(page.records[0].id);
            }
            Ok(json!(ids))
        }
        FieldType::Attachment => {
            Err("Import attachments separately after creating records.".into())
        }
        _ => Ok(json!(raw)),
    }
}
#[utoipa::path(post,path="/api/v1/imports/csv/preview",request_body=ImportRequest,responses((status=200,body=ImportPreview)))]
pub async fn preview(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    ApiJson(input): ApiJson<ImportRequest>,
) -> HttpResult<Json<ImportPreview>> {
    Ok(Json(prepare(&s, a, &input).await?))
}
#[utoipa::path(post,path="/api/v1/imports/csv/commit",request_body=ImportRequest,responses((status=200,body=ImportResult)))]
pub async fn commit(
    State(s): State<Arc<AppState>>,
    Extension(a): Extension<Actor>,
    ApiJson(input): ApiJson<ImportRequest>,
) -> HttpResult<Json<ImportResult>> {
    let preview = prepare(&s, a, &input).await?;
    if !preview.valid {
        return Err(HttpError::invalid(
            "Import contains invalid rows. Preview and correct them before importing.",
        ));
    }
    let count = preview.rows.len();
    s.store
        .create_records(
            a,
            input.form_id,
            preview
                .rows
                .into_iter()
                .map(|r| CreateRecord { values: r.values })
                .collect(),
        )
        .await?;
    Ok(Json(ImportResult { created: count }))
}
