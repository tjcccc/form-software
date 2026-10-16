use crate::*;

impl Store {
    pub async fn field(&self, actor: Actor, id: Uuid) -> Result<Field> {
        let row = sqlx::query("SELECT to_jsonb(f) AS value FROM fields f JOIN forms p ON p.id=f.form_id WHERE f.id=$1 AND p.workspace_id=$2 AND p.archived_at IS NULL AND f.archived_at IS NULL")
            .bind(id).bind(actor.workspace_id).fetch_optional(&self.pool).await?.ok_or(StoreError::NotFound)?;
        decode(&row, "value")
    }
    pub async fn field_attachments(&self, actor: Actor, id: Uuid) -> Result<Vec<(Uuid, String)>> {
        self.field(actor, id).await?;
        Ok(sqlx::query("SELECT a.id,a.storage_key FROM attachments a JOIN records r ON r.id=a.record_id WHERE a.field_id=$1 AND r.deleted_at IS NULL")
            .bind(id).fetch_all(&self.pool).await?.into_iter().map(|r| Ok((r.try_get("id")?,r.try_get("storage_key")?))).collect::<std::result::Result<Vec<_>,sqlx::Error>>()?)
    }
    pub async fn duplicate_field(
        &self,
        actor: Actor,
        source_id: Uuid,
        copies: Vec<(Uuid, Uuid)>,
    ) -> Result<Field> {
        let source = self.field(actor, source_id).await?;
        let mut tx = self.pool.begin().await?;
        Self::lock_form(&mut tx, actor, source.form_id).await?;
        let source = self.field(actor, source_id).await?;
        let current = self.field_attachments(actor, source_id).await?;
        if current.len() != copies.len()
            || current
                .iter()
                .any(|(old, _)| !copies.iter().any(|(id, _)| id == old))
        {
            return Err(invalid(
                "Attachments changed. Try duplicating the field again.",
            ));
        }
        let id = Uuid::new_v4();
        let key = format!(
            "{}_{}",
            source.key.chars().take(50).collect::<String>(),
            &id.simple().to_string()[..8]
        );
        let name = format!("{} copy", source.name.chars().take(95).collect::<String>());
        sqlx::query("UPDATE fields SET position=position+1 WHERE form_id=$1 AND position>$2")
            .bind(source.form_id)
            .bind(source.position)
            .execute(&mut *tx)
            .await?;
        let row = sqlx::query("INSERT INTO fields(id,form_id,key,name,type,required,position,config,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING to_jsonb(fields) AS value")
            .bind(id).bind(source.form_id).bind(key).bind(name).bind(encode(source.field_type)?.as_str())
            .bind(source.required && source.key != "name").bind(source.position+1).bind(encode(source.config)?).bind(source.description).fetch_one(&mut *tx).await?;
        let field = decode(&row, "value")?;
        sqlx::query("UPDATE records SET data=jsonb_set(data,ARRAY[$2::text],data->$3::text) WHERE form_id=$1 AND deleted_at IS NULL AND data ? $3")
            .bind(source.form_id).bind(id.to_string()).bind(source_id.to_string()).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO record_relations(source_record_id,source_field_id,target_record_id,position) SELECT x.source_record_id,$1,x.target_record_id,x.position FROM record_relations x JOIN records r ON r.id=x.source_record_id WHERE x.source_field_id=$2 AND r.deleted_at IS NULL")
            .bind(id).bind(source_id).execute(&mut *tx).await?;
        for (old, new) in copies {
            sqlx::query("INSERT INTO attachments(id,workspace_id,record_id,field_id,filename,content_type,size_bytes,sha256,storage_key,uploaded_by) SELECT $1,workspace_id,record_id,$2,filename,content_type,size_bytes,sha256,$3,$4 FROM attachments WHERE id=$5 AND field_id=$6")
                .bind(new).bind(id).bind(new.to_string()).bind(actor.user_id).bind(old).bind(source_id).execute(&mut *tx).await?;
        }
        sqlx::query("UPDATE records SET version=version+1,updated_at=now(),updated_by=$2 WHERE form_id=$1 AND deleted_at IS NULL")
            .bind(source.form_id).bind(actor.user_id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(field)
    }
}
