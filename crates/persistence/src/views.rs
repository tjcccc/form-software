use crate::*;
impl Store {
    pub async fn views(&self, actor: Actor, form_id: Uuid) -> Result<Vec<View>> {
        self.form(actor, form_id).await?;
        let rows = sqlx::query("SELECT to_jsonb(v) AS value FROM views v WHERE form_id=$1 ORDER BY is_default DESC,name")
            .bind(form_id).fetch_all(&self.pool).await?;
        rows.iter().map(|r| decode(r, "value")).collect()
    }
    pub async fn save_view(&self, actor: Actor, form_id: Uuid, input: SaveView) -> Result<View> {
        checked(validate_name(&input.name))?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, form_id).await?;
        let schema = self.schema(actor, form_id).await?;
        let mut seen = std::collections::HashSet::new();
        for column in &input.config.columns {
            if !seen.insert(column.field_id)
                || !schema
                    .fields
                    .iter()
                    .any(|f| f.id == column.field_id && f.archived_at.is_none())
                || !(100..=800).contains(&column.width)
            {
                return Err(invalid(
                    "View columns need unique active field IDs and widths between 100 and 800.",
                ));
            }
        }
        self.records(
            actor,
            form_id,
            RecordQuery {
                group_by: input.config.group_by,
                filter: Some(serde_json::to_string(&input.config.filters)?),
                sort: input.config.sort.as_ref().map(|s| s.field_id),
                descending: input.config.sort.as_ref().is_some_and(|s| s.descending),
                limit: Some(1),
                ..Default::default()
            },
        )
        .await?;
        let row = sqlx::query("INSERT INTO views(id,form_id,name,config) VALUES($1,$2,$3,$4) ON CONFLICT(form_id,name) DO UPDATE SET config=excluded.config RETURNING to_jsonb(views) AS value")
            .bind(Uuid::new_v4()).bind(form_id).bind(input.name.trim()).bind(encode(input.config)?).fetch_one(&mut *tx).await?;
        let view = decode(&row, "value")?;
        tx.commit().await?;
        Ok(view)
    }
    pub async fn update_column_width(
        &self,
        actor: Actor,
        view_id: Uuid,
        field_id: Uuid,
        input: UpdateColumnWidth,
    ) -> Result<View> {
        if !(100..=800).contains(&input.width) {
            return Err(invalid("Column widths must be between 100 and 800 pixels."));
        }
        let form_id: Uuid = sqlx::query_scalar("SELECT v.form_id FROM views v JOIN forms f ON f.id=v.form_id WHERE v.id=$1 AND f.workspace_id=$2 AND f.archived_at IS NULL")
            .bind(view_id).bind(actor.workspace_id).fetch_optional(&self.pool).await?.ok_or(StoreError::NotFound)?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, form_id).await?;
        let fields = self.fields(form_id).await?;
        if !fields
            .iter()
            .any(|f| f.id == field_id && f.archived_at.is_none())
        {
            return Err(invalid("Column field is unavailable in this form."));
        }
        let row = sqlx::query("SELECT to_jsonb(v) AS value FROM views v WHERE id=$1")
            .bind(view_id)
            .fetch_one(&mut *tx)
            .await?;
        let mut view: View = decode(&row, "value")?;
        // Materialize implicit layouts in their existing order so adding a width
        // entry never moves a column or changes default visibility.
        let mut ordered: Vec<_> = view.config.columns.iter().map(|c| c.field_id).collect();
        for field in fields.iter().filter(|f| f.archived_at.is_none()) {
            if !ordered.contains(&field.id) {
                ordered.push(field.id);
            }
        }
        for id in ordered {
            if view.config.columns.iter().any(|c| c.field_id == id) {
                continue;
            }
            if let Some(field) = fields.iter().find(|f| f.id == id) {
                let width = if field.key == "name" {
                    350
                } else {
                    match field.field_type {
                        FieldType::LongText => 320,
                        FieldType::Duration => 118,
                        _ => 156,
                    }
                };
                view.config.columns.push(ColumnLayout {
                    field_id: id,
                    width,
                    hidden: false,
                });
            }
        }
        if let Some(column) = view
            .config
            .columns
            .iter_mut()
            .find(|c| c.field_id == field_id)
        {
            column.width = input.width;
        }
        sqlx::query("UPDATE views SET config=$2 WHERE id=$1")
            .bind(view_id)
            .bind(encode(&view.config)?)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(view)
    }
}
