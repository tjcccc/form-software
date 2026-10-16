use crate::*;
use chrono::{DateTime, NaiveDate};
use rust_decimal::Decimal;
use serde_json::Value;
use std::collections::HashSet;
use std::str::FromStr;

pub fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.chars().count() > 100 {
        return Err("Use a name between 1 and 100 characters.".into());
    }
    Ok(())
}
pub fn validate_key(key: &str) -> Result<(), String> {
    if key.len() > 64
        || !key.starts_with(|c: char| c.is_ascii_lowercase())
        || !key
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err("Keys must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64).".into());
    }
    Ok(())
}
pub fn validate_field(input: &CreateField) -> Result<(), String> {
    validate_name(&input.name)?;
    if input.description.len() > 4000 {
        return Err("Description is too long.".into());
    }
    if input.position.is_some_and(|p| !(0..=10_000).contains(&p)) {
        return Err("Invalid field position.".into());
    }
    validate_key(&input.key)?;
    if input.field_type == FieldType::Relation {
        if input.config.target_form_id.is_none()
            || input.config.cardinality.is_none()
            || input.config.presentation.is_none()
        {
            return Err(
                "Relations need a target form, cardinality, and picker presentation.".into(),
            );
        }
    } else if input.config.target_form_id.is_some()
        || input.config.cardinality.is_some()
        || input.config.presentation.is_some()
    {
        return Err("Only relation fields accept relation configuration.".into());
    }
    Ok(())
}
pub fn is_empty(value: &Value) -> bool {
    value.is_null()
        || value.as_str().is_some_and(|s| s.trim().is_empty())
        || value.as_array().is_some_and(Vec::is_empty)
}
pub fn validate_write_keys(fields: &[Field], values: &Values) -> Vec<FieldIssue> {
    values
        .keys()
        .filter(|id| {
            !fields.iter().any(|f| {
                f.id == **id && f.archived_at.is_none() && f.field_type != FieldType::Attachment
            })
        })
        .map(|id| FieldIssue {
            field_id: Some(*id),
            message: "Unknown, archived, or attachment field; attachments use the upload endpoint."
                .into(),
        })
        .collect()
}
pub fn validate_values(
    fields: &[Field],
    values: &Values,
    attachments: &[Attachment],
) -> Vec<FieldIssue> {
    let mut issues = Vec::new();
    for field in fields.iter().filter(|f| f.archived_at.is_none()) {
        let value = values.get(&field.id).unwrap_or(&Value::Null);
        if field.field_type == FieldType::Attachment {
            if field.required && !attachments.iter().any(|a| a.field_id == field.id) {
                issues.push(FieldIssue {
                    field_id: Some(field.id),
                    message: "An attachment is required.".into(),
                });
            }
            continue;
        }
        let result = if is_empty(value) {
            if field.required {
                Err("This field is required.")
            } else {
                Ok(())
            }
        } else {
            validate_value(field, value)
        };
        if let Err(message) = result {
            issues.push(FieldIssue {
                field_id: Some(field.id),
                message: message.into(),
            });
        }
    }
    issues
}
/// Canonical storage preserves date-time instants in UTC without using local timezone state.
pub fn canonical_value(field: &Field, value: &Value) -> Value {
    if field.field_type == FieldType::DateTime
        && let Some(text) = value.as_str()
        && let Ok(date) = DateTime::parse_from_rfc3339(text)
    {
        return Value::String(
            date.with_timezone(&chrono::Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true),
        );
    }
    value.clone()
}
fn validate_value(field: &Field, value: &Value) -> Result<(), &'static str> {
    let valid = match field.field_type {
        FieldType::ShortText => value.as_str().is_some_and(|s| s.chars().count() <= 500),
        FieldType::LongText => value.as_str().is_some_and(|s| s.len() <= 100_000),
        FieldType::Integer => value
            .as_i64()
            .is_some_and(|n| n.unsigned_abs() <= 9_007_199_254_740_991),
        FieldType::Decimal => value
            .as_str()
            .is_some_and(|s| s.len() <= 64 && Decimal::from_str(s).is_ok()),
        FieldType::Boolean => value.is_boolean(),
        FieldType::Date => value
            .as_str()
            .is_some_and(|s| s.len() == 10 && NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()),
        FieldType::DateTime => value
            .as_str()
            .is_some_and(|s| DateTime::parse_from_rfc3339(s).is_ok()),
        FieldType::Duration => value
            .as_i64()
            .is_some_and(|n| (0..=52_560_000).contains(&n)),
        FieldType::Url => value.as_str().is_some_and(|s| {
            s.len() <= 4096
                && url::Url::parse(s)
                    .is_ok_and(|u| matches!(u.scheme(), "https" | "http") && u.host_str().is_some())
        }),
        FieldType::Relation => value.as_array().is_some_and(|ids| {
            ids.len() <= 100
                && (field.config.cardinality != Some(Cardinality::One) || ids.len() <= 1)
                && ids.iter().all(|id| {
                    id.as_str()
                        .is_some_and(|s| uuid::Uuid::parse_str(s).is_ok())
                })
                && ids.iter().collect::<HashSet<_>>().len() == ids.len()
        }),
        FieldType::Attachment => false,
    };
    if valid {
        Ok(())
    } else {
        Err(match field.field_type {
            FieldType::ShortText => "Use text of at most 500 characters.",
            FieldType::LongText => "Use text of at most 100 KB.",
            FieldType::Integer => "Use a whole number in the JavaScript-safe integer range.",
            FieldType::Decimal => "Use an exact decimal string, such as 12.50.",
            FieldType::Boolean => "Use true or false.",
            FieldType::Date => "Use a valid date in YYYY-MM-DD format.",
            FieldType::DateTime => "Use an ISO 8601 timestamp with a timezone.",
            FieldType::Duration => "Use a non-negative whole number of minutes.",
            FieldType::Url => "Use a complete HTTP or HTTPS URL.",
            FieldType::Relation => "Use unique record UUIDs within the field's cardinality.",
            FieldType::Attachment => "Use the attachment upload endpoint.",
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn field(kind: FieldType) -> Field {
        Field {
            description: String::new(),
            id: uuid::Uuid::new_v4(),
            form_id: uuid::Uuid::new_v4(),
            key: "value".into(),
            name: "Value".into(),
            field_type: kind,
            required: true,
            position: 0,
            config: FieldConfig::default(),
            archived_at: None,
        }
    }
    #[test]
    fn exact_decimals_and_calendar_dates() {
        assert!(validate_value(&field(FieldType::Decimal), &json!("12.50")).is_ok());
        assert!(validate_value(&field(FieldType::Decimal), &json!(12.5)).is_err());
        let timestamp = field(FieldType::DateTime);
        assert!(validate_value(&timestamp, &json!("2026-10-16T01:00:00")).is_err());
        assert_eq!(
            canonical_value(&timestamp, &json!("2026-10-16T01:00:00+08:00")),
            json!("2026-10-15T17:00:00Z")
        );
        assert!(validate_value(&field(FieldType::Date), &json!("2024-02-29")).is_ok());
        assert!(validate_value(&field(FieldType::Date), &json!("2025-02-29")).is_err());
        assert!(validate_value(&field(FieldType::Url), &json!("javascript:alert(1)")).is_err());
    }
    #[test]
    fn relation_cardinality_and_duplicates() {
        let mut f = field(FieldType::Relation);
        f.config.cardinality = Some(Cardinality::One);
        let id = uuid::Uuid::new_v4().to_string();
        assert!(validate_value(&f, &json!([id])).is_ok());
        assert!(validate_value(&f, &json!([id, id])).is_err());
        f.config.cardinality = Some(Cardinality::Many);
        assert!(validate_value(&f, &json!([id, id])).is_err());
    }
}
