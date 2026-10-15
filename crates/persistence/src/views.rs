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
                filter: Some(serde_json::to_string(&input.config.filters)?),
                sort: input.config.sort.as_ref().map(|s| s.field_id),
                descending: input.config.sort.as_ref().is_some_and(|s| s.descending),
                limit: Some(1),
                ..Default::default()
            },
        )
        .await?;
        let row = sqlx::query("INSERT INTO views(id,form_id,name,config) VALUES($1,$2,$3,$4) ON CONFLICT(form_id,name) DO UPDATE SET config=excluded.config RETURNING to_jsonb(views) AS value")
            .bind(Uuid::new_v4()).bind(form_id).bind(input.name.trim()).bind(encode(input.config)?).fetch_one(&self.pool).await?;
        decode(&row, "value")
    }
}
