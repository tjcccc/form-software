use crate::*;
use serde_json::Value;
use sqlx::{QueryBuilder, Row};
use std::collections::BTreeMap;

const RECORD_VALUE: &str = "jsonb_build_object('id',r.id,'form_id',r.form_id,'version',r.version,'created_at',r.created_at,'updated_at',r.updated_at,'created_by',r.created_by,'updated_by',r.updated_by,'values',r.data || coalesce((SELECT jsonb_object_agg(x.source_field_id, x.ids) FROM (SELECT source_field_id,jsonb_agg(target_record_id ORDER BY position) AS ids FROM record_relations WHERE source_record_id=r.id GROUP BY source_field_id) x),'{}'::jsonb),'attachments',coalesce((SELECT jsonb_agg(to_jsonb(a)-'storage_key'-'workspace_id'-'uploaded_by'-'created_at' ORDER BY a.created_at) FROM attachments a WHERE a.record_id=r.id),'[]'::jsonb))";
impl Store {
    pub async fn record(&self, actor: Actor, id: Uuid) -> Result<Record> {
        let row = sqlx::query(&format!("SELECT {RECORD_VALUE} AS value FROM records r JOIN forms f ON f.id=r.form_id WHERE r.id=$1 AND f.workspace_id=$2 AND f.archived_at IS NULL AND r.deleted_at IS NULL"))
            .bind(id).bind(actor.workspace_id).fetch_optional(&self.pool).await?.ok_or(StoreError::NotFound)?;
        decode(&row, "value")
    }
    pub async fn records(
        &self,
        actor: Actor,
        form_id: Uuid,
        query: RecordQuery,
    ) -> Result<RecordPage> {
        let schema = self.schema(actor, form_id).await?;
        let filters: Vec<Filter> = match query.filter.as_deref() {
            Some(s) => serde_json::from_str(s).map_err(|_| invalid("Malformed filter JSON."))?,
            None => vec![],
        };
        if filters.len() > 20 || query.q.as_ref().is_some_and(|q| q.len() > 500) {
            return Err(invalid("Query is too large."));
        }
        let limit = query.limit.unwrap_or(50).clamp(1, 100);
        let offset = query.cursor.unwrap_or(0);
        if offset > 1_000_000 {
            return Err(invalid("Cursor exceeds the supported range."));
        }
        let mut qb = QueryBuilder::<Postgres>::new(
            "WITH matching AS (SELECT r.* FROM records r WHERE r.form_id=",
        );
        qb.push_bind(form_id).push(" AND r.deleted_at IS NULL");
        if let Some(search) = query.q.filter(|s| !s.trim().is_empty()) {
            qb.push(" AND EXISTS(SELECT 1 FROM jsonb_each_text(r.data) d WHERE position(")
                .push_bind(search.to_lowercase())
                .push(" in lower(d.value))>0)");
        }
        for filter in filters {
            let field = schema
                .fields
                .iter()
                .find(|f| f.id == filter.field_id && f.archived_at.is_none())
                .ok_or(invalid("Filter field is unavailable."))?;
            append_filter(&mut qb, field, filter)?;
        }
        qb.push("), page AS (SELECT r.* FROM matching r");
        if let Some(sort) = query.sort {
            let field = schema
                .fields
                .iter()
                .find(|f| f.id == sort && f.archived_at.is_none())
                .ok_or(invalid("Sort field is unavailable."))?;
            if matches!(
                field.field_type,
                FieldType::Relation | FieldType::Attachment
            ) {
                return Err(invalid("Sort a scalar field instead."));
            }
            qb.push(" ORDER BY ");
            push_scalar(&mut qb, field);
            qb.push(if query.descending {
                " DESC NULLS LAST"
            } else {
                " ASC NULLS LAST"
            })
            .push(", r.id");
        } else {
            qb.push(" ORDER BY r.created_at DESC, r.id");
        }
        qb.push(" LIMIT ")
            .push_bind(i64::from(limit))
            .push(" OFFSET ")
            .push_bind(i64::from(offset));
        qb.push(") SELECT (SELECT count(*) FROM matching) AS total, coalesce(jsonb_agg(")
            .push(RECORD_VALUE)
            .push("),'[]'::jsonb) AS value FROM page r");
        let row = qb.build().fetch_one(&self.pool).await?;
        let total: i64 = row.try_get("total")?;
        let records: Vec<Record> = decode(&row, "value")?;
        let next = offset + records.len() as u32;
        Ok(RecordPage {
            records,
            total,
            next_cursor: (i64::from(next) < total).then_some(next),
        })
    }
    pub async fn create_record(
        &self,
        actor: Actor,
        form_id: Uuid,
        input: CreateRecord,
    ) -> Result<Record> {
        let records = self.create_records(actor, form_id, vec![input]).await?;
        records
            .into_iter()
            .next()
            .ok_or_else(|| invalid("No record was created."))
    }
    pub async fn create_records(
        &self,
        actor: Actor,
        form_id: Uuid,
        inputs: Vec<CreateRecord>,
    ) -> Result<Vec<Record>> {
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, form_id).await?;
        let fields = self.fields(form_id).await?;
        let mut ids = Vec::new();
        for input in inputs {
            issues(validate_write_keys(&fields, &input.values))?;
            issues(validate_values(&fields, &input.values, &[]))?;
            let id = Uuid::new_v4();
            let data = scalar_values(&fields, &input.values);
            sqlx::query("INSERT INTO records(id,form_id,data,created_by,updated_by) VALUES ($1,$2,$3,$4,$4)")
                .bind(id).bind(form_id).bind(encode(data)?).bind(actor.user_id).execute(&mut *tx).await?;
            write_relations(&mut tx, actor, id, &fields, &input.values, &Values::new()).await?;
            ids.push(id);
        }
        tx.commit().await?;
        let mut records = Vec::new();
        for id in ids {
            records.push(self.record(actor, id).await?);
        }
        Ok(records)
    }
    pub async fn update_record(
        &self,
        actor: Actor,
        id: Uuid,
        input: UpdateRecord,
    ) -> Result<Record> {
        let current = self.record(actor, id).await?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, current.form_id).await?;
        let current = self.record(actor, id).await?;
        if current.version != input.expected_version {
            return Err(StoreError::Conflict(Box::new(current)));
        }
        let fields = self.fields(current.form_id).await?;
        issues(validate_write_keys(&fields, &input.values))?;
        let mut merged = current.values.clone();
        merged.extend(input.values);
        issues(validate_values(&fields, &merged, &current.attachments))?;
        write_relations(&mut tx, actor, id, &fields, &merged, &current.values).await?;
        sqlx::query("UPDATE records SET data=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1")
            .bind(id).bind(encode(scalar_values(&fields, &merged))?).bind(actor.user_id).execute(&mut *tx).await?;
        tx.commit().await?;
        self.record(actor, id).await
    }
    pub async fn archive_record(
        &self,
        actor: Actor,
        id: Uuid,
        expected_version: i32,
    ) -> Result<()> {
        let current = self.record(actor, id).await?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, current.form_id).await?;
        let current = self.record(actor, id).await?;
        if current.version != expected_version {
            return Err(StoreError::Conflict(Box::new(current)));
        }
        // The target lock also serializes against new relation assignments.
        sqlx::query("SELECT id FROM records WHERE id=$1 FOR UPDATE")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        let referenced: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM record_relations x JOIN records r ON r.id=x.source_record_id JOIN fields f ON f.id=x.source_field_id WHERE x.target_record_id=$1 AND r.deleted_at IS NULL AND f.archived_at IS NULL)")
            .bind(id).fetch_one(&mut *tx).await?;
        if referenced {
            return Err(invalid(
                "This record is referenced. Remove its references, or disable the option to preserve history.",
            ));
        }
        sqlx::query("UPDATE records SET deleted_at=now(),version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1").bind(id).bind(actor.user_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn validate_record_input(
        &self,
        actor: Actor,
        form_id: Uuid,
        values: &Values,
    ) -> Result<Vec<FieldIssue>> {
        let schema = self.schema(actor, form_id).await?;
        let mut result = validate_write_keys(&schema.fields, values);
        result.extend(validate_values(&schema.fields, values, &[]));
        let mut tx = self.pool.begin().await?;
        // Same relation checks as a write, rolled back after validation.
        if result.is_empty()
            && let Err(error) =
                check_relations(&mut tx, actor, &schema.fields, values, &Values::new()).await
        {
            match error {
                StoreError::Validation(mut i) => result.append(&mut i),
                e => return Err(e),
            }
        }
        tx.rollback().await?;
        Ok(result)
    }
}
fn scalar_values(fields: &[Field], values: &Values) -> BTreeMap<Uuid, Value> {
    values
        .iter()
        .filter_map(|(id, value)| {
            fields
                .iter()
                .find(|f| {
                    f.id == *id
                        && !matches!(f.field_type, FieldType::Relation | FieldType::Attachment)
                })
                .map(|field| (*id, canonical_value(field, value)))
        })
        .collect()
}
async fn check_relations(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor,
    fields: &[Field],
    values: &Values,
    previous: &Values,
) -> Result<()> {
    for field in fields
        .iter()
        .filter(|f| f.field_type == FieldType::Relation && f.archived_at.is_none())
    {
        let Some(ids) = values.get(&field.id).and_then(Value::as_array) else {
            continue;
        };
        for value in ids {
            let id = value
                .as_str()
                .and_then(|s| Uuid::parse_str(s).ok())
                .ok_or(invalid("Invalid relation UUID."))?;
            let row = sqlx::query("SELECT r.data, f.kind, (SELECT id FROM fields WHERE form_id=f.id AND key='enabled') AS enabled_field FROM records r JOIN forms f ON f.id=r.form_id WHERE r.id=$1 AND r.form_id=$2 AND f.workspace_id=$3 AND f.archived_at IS NULL AND r.deleted_at IS NULL FOR SHARE OF r")
                .bind(id).bind(field.config.target_form_id).bind(actor.workspace_id).fetch_optional(&mut **tx).await?;
            let unavailable = if let Some(row) = row {
                let enabled: Option<Uuid> = row.try_get("enabled_field")?;
                let data: Value = row.try_get("data")?;
                let was_assigned = previous
                    .get(&field.id)
                    .and_then(Value::as_array)
                    .is_some_and(|a| a.contains(value));
                !was_assigned
                    && enabled
                        .is_some_and(|eid| data.get(eid.to_string()).is_some_and(|v| v == false))
            } else {
                true
            };
            if unavailable {
                return Err(StoreError::Validation(vec![FieldIssue {
                    field_id: Some(field.id),
                    message:
                        "A related record is unavailable, disabled, or belongs to another form."
                            .into(),
                }]));
            }
        }
    }
    Ok(())
}
async fn write_relations(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor,
    id: Uuid,
    fields: &[Field],
    values: &Values,
    previous: &Values,
) -> Result<()> {
    check_relations(tx, actor, fields, values, previous).await?;
    for field in fields
        .iter()
        .filter(|f| f.field_type == FieldType::Relation && f.archived_at.is_none())
    {
        sqlx::query(
            "DELETE FROM record_relations WHERE source_record_id=$1 AND source_field_id=$2",
        )
        .bind(id)
        .bind(field.id)
        .execute(&mut **tx)
        .await?;
        for (position, value) in values
            .get(&field.id)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .enumerate()
        {
            let target = value
                .as_str()
                .and_then(|s| Uuid::parse_str(s).ok())
                .ok_or(invalid("Invalid relation UUID."))?;
            sqlx::query("INSERT INTO record_relations(source_record_id,source_field_id,target_record_id,position) VALUES ($1,$2,$3,$4)").bind(id).bind(field.id).bind(target).bind(position as i32).execute(&mut **tx).await?;
        }
    }
    Ok(())
}
fn push_scalar(qb: &mut QueryBuilder<'_, Postgres>, field: &Field) {
    let cast = match field.field_type {
        FieldType::Integer | FieldType::Decimal | FieldType::Duration => "::numeric",
        FieldType::Boolean => "::boolean",
        FieldType::DateTime => "::timestamptz",
        _ => "",
    };
    qb.push("(r.data ->> ")
        .push_bind(field.id.to_string())
        .push(")")
        .push(cast);
}
fn append_filter(qb: &mut QueryBuilder<'_, Postgres>, field: &Field, filter: Filter) -> Result<()> {
    qb.push(" AND ");
    if matches!(
        field.field_type,
        FieldType::Relation | FieldType::Attachment
    ) {
        let (table, fk) = if field.field_type == FieldType::Relation {
            ("record_relations", "source_record_id")
        } else {
            ("attachments", "record_id")
        };
        if matches!(filter.op, FilterOp::Empty) {
            qb.push("NOT ");
        } else if !matches!(filter.op, FilterOp::Eq | FilterOp::Contains)
            || field.field_type == FieldType::Attachment
        {
            return Err(invalid("Unsupported relation/attachment filter."));
        }
        qb.push("EXISTS(SELECT 1 FROM ")
            .push(table)
            .push(" x WHERE x.")
            .push(fk)
            .push("=r.id AND x.")
            .push(if field.field_type == FieldType::Relation {
                "source_field_id"
            } else {
                "field_id"
            })
            .push("=")
            .push_bind(field.id);
        if !matches!(filter.op, FilterOp::Empty) {
            let id = filter
                .value
                .as_str()
                .and_then(|s| Uuid::parse_str(s).ok())
                .ok_or(invalid("Relation filters need a record UUID."))?;
            qb.push(" AND x.target_record_id=").push_bind(id);
        }
        qb.push(")");
    } else if matches!(filter.op, FilterOp::Empty) {
        qb.push("(r.data->")
            .push_bind(field.id.to_string())
            .push(" IS NULL OR r.data->")
            .push_bind(field.id.to_string())
            .push("='null'::jsonb OR btrim(r.data->>")
            .push_bind(field.id.to_string())
            .push(")='')");
    } else if matches!(filter.op, FilterOp::Contains) {
        if !matches!(
            field.field_type,
            FieldType::ShortText | FieldType::LongText | FieldType::Url
        ) {
            return Err(invalid("Contains is available on text fields."));
        }
        let value = filter
            .value
            .as_str()
            .ok_or(invalid("Contains needs text."))?;
        qb.push("position(")
            .push_bind(value.to_lowercase())
            .push(" in lower(r.data->>")
            .push_bind(field.id.to_string())
            .push(")) > 0");
    } else {
        issues(validate_values(
            &[Field {
                required: false,
                ..field.clone()
            }],
            &[(field.id, filter.value.clone())].into(),
            &[],
        ))?;
        if filter.value.is_null() {
            return Err(invalid("Use the empty operator for empty values."));
        }
        if field.field_type == FieldType::Boolean && !matches!(filter.op, FilterOp::Eq) {
            return Err(invalid("Boolean fields support equals or empty."));
        }
        push_scalar(qb, field);
        qb.push(match filter.op {
            FilterOp::Eq => " = ",
            FilterOp::Gt => " > ",
            FilterOp::Gte => " >= ",
            FilterOp::Lt => " < ",
            FilterOp::Lte => " <= ",
            _ => unreachable!(),
        });
        let scalar = match &filter.value {
            Value::String(s) => s.clone(),
            v => v.to_string(),
        };
        qb.push_bind(scalar);
        qb.push(match field.field_type {
            FieldType::Integer | FieldType::Decimal | FieldType::Duration => "::numeric",
            FieldType::Boolean => "::boolean",
            FieldType::DateTime => "::timestamptz",
            _ => "::text",
        });
    }
    Ok(())
}
