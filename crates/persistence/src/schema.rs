use crate::*;
use serde_json::json;

const FORM_SELECT: &str = "SELECT to_jsonb(f) || jsonb_build_object('record_count', (SELECT count(*) FROM records r WHERE r.form_id=f.id AND r.deleted_at IS NULL)) AS value FROM forms f";
impl Store {
    pub async fn forms(&self, actor: Actor) -> Result<Vec<Form>> {
        let rows = sqlx::query(&format!("{FORM_SELECT} WHERE f.workspace_id=$1 AND f.archived_at IS NULL ORDER BY f.created_at, f.id"))
            .bind(actor.workspace_id).fetch_all(&self.pool).await?;
        rows.iter().map(|r| decode(r, "value")).collect()
    }
    pub async fn form(&self, actor: Actor, id: Uuid) -> Result<Form> {
        let row = sqlx::query(&format!(
            "{FORM_SELECT} WHERE f.id=$1 AND f.workspace_id=$2 AND f.archived_at IS NULL"
        ))
        .bind(id)
        .bind(actor.workspace_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(StoreError::NotFound)?;
        decode(&row, "value")
    }
    pub async fn schema(&self, actor: Actor, id: Uuid) -> Result<FormSchema> {
        let form = self.form(actor, id).await?;
        let fields = self.fields(id).await?;
        Ok(FormSchema { form, fields })
    }
    pub(crate) async fn fields(&self, form_id: Uuid) -> Result<Vec<Field>> {
        let rows = sqlx::query("SELECT to_jsonb(f) AS value FROM fields f WHERE form_id=$1 ORDER BY position, created_at, id")
            .bind(form_id).fetch_all(&self.pool).await?;
        rows.iter().map(|r| decode(r, "value")).collect()
    }
    pub async fn create_form(&self, actor: Actor, input: CreateForm) -> Result<FormSchema> {
        checked(validate_name(&input.name))?;
        checked(validate_key(&input.key))?;
        if input.description.len() > 4000 {
            return Err(invalid("Description is too long."));
        }
        if ![
            "table",
            "briefcase",
            "gamepad",
            "folder",
            "building",
            "tag",
            "book",
        ]
        .contains(&input.icon.as_str())
        {
            return Err(invalid("Unknown form icon."));
        }
        let id = Uuid::new_v4();
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO forms(id, workspace_id, key, name, description, kind, icon) VALUES ($1,$2,$3,$4,$5,$6,$7)")
            .bind(id).bind(actor.workspace_id).bind(&input.key).bind(input.name.trim()).bind(&input.description)
            .bind(encode(input.kind)?.as_str()).bind(input.icon).execute(&mut *tx).await?;
        let defaults = if input.kind == FormKind::Options {
            vec![
                ("name", "Name", FieldType::ShortText, true),
                ("color", "Color", FieldType::ShortText, false),
                ("enabled", "Enabled", FieldType::Boolean, false),
                ("position", "Position", FieldType::Integer, false),
            ]
        } else {
            vec![("name", "Name", FieldType::ShortText, true)]
        };
        for (i, (key, name, kind, required)) in defaults.into_iter().enumerate() {
            sqlx::query("INSERT INTO fields(id,form_id,key,name,type,required,position) VALUES ($1,$2,$3,$4,$5,$6,$7)")
                .bind(Uuid::new_v4()).bind(id).bind(key).bind(name).bind(encode(kind)?.as_str()).bind(required).bind(i as i32).execute(&mut *tx).await?;
        }
        sqlx::query("INSERT INTO views(id,form_id,name,is_default,config) VALUES ($1,$2,'All records',true,$3)")
            .bind(Uuid::new_v4()).bind(id).bind(json!({"columns":[], "sort":null, "filters":[]})).execute(&mut *tx).await?;
        tx.commit().await?;
        self.schema(actor, id).await
    }
    pub async fn update_form(&self, actor: Actor, id: Uuid, input: UpdateForm) -> Result<Form> {
        if let Some(name) = &input.name {
            checked(validate_name(name))?;
        }
        if input.description.as_ref().is_some_and(|d| d.len() > 4000) {
            return Err(invalid("Description is too long."));
        }
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, id).await?;
        if input.archived == Some(true) {
            let used: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM fields f JOIN forms p ON p.id=f.form_id WHERE f.archived_at IS NULL AND p.archived_at IS NULL AND f.config->>'target_form_id'=$1)")
                .bind(id.to_string()).fetch_one(&mut *tx).await?;
            if used {
                return Err(invalid(
                    "This form is a relation target. Archive the referencing fields first.",
                ));
            }
        }
        sqlx::query("UPDATE forms SET name=coalesce($3,name),description=coalesce($4,description),archived_at=CASE WHEN $5 THEN now() ELSE archived_at END,updated_at=now() WHERE id=$1 AND workspace_id=$2")
            .bind(id).bind(actor.workspace_id).bind(input.name).bind(input.description).bind(input.archived.unwrap_or(false)).execute(&mut *tx).await?;
        tx.commit().await?;
        // Archived form remains a valid response, but is omitted from navigation.
        let row = sqlx::query(&format!(
            "{FORM_SELECT} WHERE f.id=$1 AND f.workspace_id=$2"
        ))
        .bind(id)
        .bind(actor.workspace_id)
        .fetch_one(&self.pool)
        .await?;
        decode(&row, "value")
    }
    pub async fn create_field(
        &self,
        actor: Actor,
        form_id: Uuid,
        input: CreateField,
    ) -> Result<Field> {
        checked(validate_field(&input))?;
        if input.required && input.field_type == FieldType::Attachment {
            return Err(invalid(
                "Attachment fields must be optional so records can be created before uploading.",
            ));
        }
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, form_id).await?;
        if let Some(target) = input.config.target_form_id {
            sqlx::query("SELECT id FROM forms WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL FOR SHARE")
                .bind(target).bind(actor.workspace_id).fetch_optional(&mut *tx).await?.ok_or(invalid("Target form is unavailable in this workspace."))?;
        }
        if input.required {
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM records WHERE form_id=$1 AND deleted_at IS NULL",
            )
            .bind(form_id)
            .fetch_one(&mut *tx)
            .await?;
            if count > 0 {
                return Err(invalid(
                    "Add this field as optional, populate existing records, then make it required.",
                ));
            }
        }
        let position: i32 = match input.position {
            Some(p) => {
                sqlx::query(
                    "UPDATE fields SET position=position+1 WHERE form_id=$1 AND position >= $2",
                )
                .bind(form_id)
                .bind(p)
                .execute(&mut *tx)
                .await?;
                p
            }
            None => {
                sqlx::query_scalar(
                    "SELECT coalesce(max(position),-1)+1 FROM fields WHERE form_id=$1",
                )
                .bind(form_id)
                .fetch_one(&mut *tx)
                .await?
            }
        };
        let row = sqlx::query("INSERT INTO fields(id,form_id,key,name,type,required,config,position,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING to_jsonb(fields) AS value")
            .bind(Uuid::new_v4()).bind(form_id).bind(input.key).bind(input.name.trim()).bind(encode(input.field_type)?.as_str())
            .bind(input.required).bind(encode(input.config)?).bind(position).bind(input.description).fetch_one(&mut *tx).await?;
        let field = decode(&row, "value")?;
        tx.commit().await?;
        Ok(field)
    }
    pub async fn update_field(&self, actor: Actor, id: Uuid, input: UpdateField) -> Result<Field> {
        if let Some(name) = &input.name {
            checked(validate_name(name))?;
        }
        if input.description.as_ref().is_some_and(|d| d.len() > 4000) {
            return Err(invalid("Description is too long."));
        }
        if input.position.is_some_and(|p| !(0..=10_000).contains(&p)) {
            return Err(invalid("Invalid field position."));
        }
        let row = sqlx::query("SELECT to_jsonb(f) AS value FROM fields f JOIN forms p ON p.id=f.form_id WHERE f.id=$1 AND p.workspace_id=$2 AND p.archived_at IS NULL")
            .bind(id).bind(actor.workspace_id).fetch_optional(&self.pool).await?.ok_or(StoreError::NotFound)?;
        let field: Field = decode(&row, "value")?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, field.form_id).await?;
        // Re-read after acquiring the form lock: another client may have changed
        // requiredness or archived the field while this request was waiting.
        let row = sqlx::query("SELECT to_jsonb(f) AS value FROM fields f WHERE id=$1")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        let field: Field = decode(&row, "value")?;
        if field.key == "name" && (input.archived == Some(true) || input.required == Some(false)) {
            return Err(invalid(
                "The primary Name field must remain active and required.",
            ));
        }
        if field.archived_at.is_some() {
            return Err(invalid("Archived fields cannot be changed."));
        }
        if let Some(config) = &input.config {
            if !matches!(field.field_type, FieldType::Integer | FieldType::Decimal) {
                return Err(invalid(
                    "Only number and rating display settings can be changed.",
                ));
            }
            checked(validate_field(&CreateField {
                key: field.key.clone(),
                name: field.name.clone(),
                description: field.description.clone(),
                field_type: field.field_type,
                required: field.required,
                position: None,
                config: config.clone(),
            }))?;
            if let Some(rating) = &config.rating {
                let outside: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM records WHERE form_id=$1 AND deleted_at IS NULL AND (NULLIF(btrim(data->>($2::text)),'')::numeric < 0 OR NULLIF(btrim(data->>($2::text)),'')::numeric > $3))")
                    .bind(field.form_id).bind(id.to_string()).bind(i32::from(rating.max)).fetch_one(&mut *tx).await?;
                if outside {
                    return Err(invalid(
                        "Existing values exceed this rating scale. Adjust the values first.",
                    ));
                }
            }
        }
        if input.required == Some(true) && !field.required {
            if field.field_type == FieldType::Attachment {
                return Err(invalid("Attachment fields must be optional."));
            }
            let missing: bool = if field.field_type == FieldType::Relation {
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM records r WHERE form_id=$1 AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM record_relations x WHERE x.source_record_id=r.id AND x.source_field_id=$2))")
                    .bind(field.form_id).bind(id).fetch_one(&mut *tx).await?
            } else {
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM records WHERE form_id=$1 AND deleted_at IS NULL AND (data->($2::text) IS NULL OR data->($2::text)='null'::jsonb OR btrim(data->>($2::text))=''))")
                    .bind(field.form_id).bind(id.to_string()).fetch_one(&mut *tx).await?
            };
            if missing {
                return Err(invalid(
                    "Populate this field on all existing records before making it required.",
                ));
            }
        }
        let row = sqlx::query("UPDATE fields SET name=coalesce($2,name),description=coalesce($6,description),config=coalesce($7,config),required=coalesce($3,required),position=coalesce($4,position),archived_at=CASE WHEN $5 THEN now() ELSE archived_at END WHERE id=$1 RETURNING to_jsonb(fields) AS value")
            .bind(id).bind(input.name).bind(input.required).bind(input.position).bind(input.archived.unwrap_or(false)).bind(input.description).bind(input.config.map(encode).transpose()?).fetch_one(&mut *tx).await?;
        let result = decode(&row, "value")?;
        if input.archived == Some(true) {
            let views = sqlx::query("SELECT id,config FROM views WHERE form_id=$1")
                .bind(field.form_id)
                .fetch_all(&mut *tx)
                .await?;
            for view in views {
                let mut config: ViewConfig = serde_json::from_value(view.try_get("config")?)?;
                config.columns.retain(|c| c.field_id != id);
                config.filters.retain(|f| f.field_id != id);
                if config.sort.as_ref().is_some_and(|s| s.field_id == id) {
                    config.sort = None;
                }
                if config.group_by == Some(id) {
                    config.group_by = None;
                }
                sqlx::query("UPDATE views SET config=$2 WHERE id=$1")
                    .bind(view.try_get::<Uuid, _>("id")?)
                    .bind(encode(config)?)
                    .execute(&mut *tx)
                    .await?;
            }
        }
        tx.commit().await?;
        Ok(result)
    }
}
