ALTER TABLE records ADD COLUMN position bigint NOT NULL DEFAULT 0;
WITH ordered AS (
    SELECT id, row_number() OVER (PARTITION BY form_id ORDER BY created_at DESC, id) AS position
    FROM records
)
UPDATE records SET position = ordered.position FROM ordered WHERE records.id = ordered.id;
CREATE INDEX records_manual_order ON records(form_id, position, id) WHERE deleted_at IS NULL;
