use crate::*;
impl Store {
    pub async fn attachment(&self, actor: Actor, id: Uuid) -> Result<(Attachment, String)> {
        let row = sqlx::query("SELECT to_jsonb(a) AS value, storage_key FROM attachments a JOIN records r ON r.id=a.record_id JOIN forms f ON f.id=r.form_id WHERE a.id=$1 AND a.workspace_id=$2 AND r.deleted_at IS NULL AND f.archived_at IS NULL")
            .bind(id).bind(actor.workspace_id).fetch_optional(&self.pool).await?.ok_or(StoreError::NotFound)?;
        Ok((decode(&row, "value")?, row.try_get("storage_key")?))
    }
    pub async fn add_attachment(
        &self,
        actor: Actor,
        attachment: Attachment,
        storage_key: &str,
        expected_version: i32,
    ) -> Result<Record> {
        let current = self.record(actor, attachment.record_id).await?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, current.form_id).await?;
        let current = self.record(actor, attachment.record_id).await?;
        if current.version != expected_version {
            return Err(StoreError::Conflict(Box::new(current)));
        }
        let fields = self.fields(current.form_id).await?;
        if !fields.iter().any(|f| {
            f.id == attachment.field_id
                && f.field_type == FieldType::Attachment
                && f.archived_at.is_none()
        }) {
            return Err(invalid("Attachment field is unavailable."));
        }
        if current.attachments.len() >= 50 {
            return Err(invalid("A record can have at most 50 attachments."));
        }
        sqlx::query("INSERT INTO attachments(id,workspace_id,record_id,field_id,filename,content_type,size_bytes,sha256,storage_key,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
            .bind(attachment.id).bind(actor.workspace_id).bind(attachment.record_id).bind(attachment.field_id).bind(attachment.filename)
            .bind(attachment.content_type).bind(attachment.size_bytes).bind(attachment.sha256).bind(storage_key).bind(actor.user_id).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE records SET version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1",
        )
        .bind(current.id)
        .bind(actor.user_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        self.record(actor, current.id).await
    }
    pub async fn remove_attachment(
        &self,
        actor: Actor,
        id: Uuid,
        expected_version: i32,
    ) -> Result<Record> {
        let (attachment, _) = self.attachment(actor, id).await?;
        let current = self.record(actor, attachment.record_id).await?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, current.form_id).await?;
        let current = self.record(actor, current.id).await?;
        if current.version != expected_version {
            return Err(StoreError::Conflict(Box::new(current)));
        }
        sqlx::query("DELETE FROM attachments WHERE id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "UPDATE records SET version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1",
        )
        .bind(current.id)
        .bind(actor.user_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        self.record(actor, current.id).await
    }
}
