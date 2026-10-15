CREATE TABLE workspaces (
    id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE users (
    id UUID PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE workspace_memberships (
    workspace_id UUID NOT NULL REFERENCES workspaces(id), user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role = 'owner'), PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id), expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE forms (
    id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
    key TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL CHECK (kind IN ('standard', 'options')), icon TEXT NOT NULL DEFAULT 'table',
    archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(workspace_id, key), UNIQUE(workspace_id, id)
);
CREATE TABLE fields (
    id UUID PRIMARY KEY, form_id UUID NOT NULL REFERENCES forms(id),
    key TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
    position INTEGER NOT NULL, required BOOLEAN NOT NULL DEFAULT false,
    config JSONB NOT NULL DEFAULT '{}', archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(form_id, key), UNIQUE(form_id, id)
);
CREATE INDEX fields_form ON fields(form_id, position);
CREATE TABLE records (
    id UUID PRIMARY KEY, form_id UUID NOT NULL REFERENCES forms(id),
    data JSONB NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by UUID NOT NULL REFERENCES users(id), updated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ, UNIQUE(form_id, id)
);
CREATE INDEX records_form_active ON records(form_id, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE TABLE record_relations (
    source_record_id UUID NOT NULL REFERENCES records(id), source_field_id UUID NOT NULL REFERENCES fields(id),
    target_record_id UUID NOT NULL REFERENCES records(id), position INTEGER NOT NULL,
    PRIMARY KEY (source_record_id, source_field_id, target_record_id)
);
CREATE INDEX relations_target ON record_relations(target_record_id);
CREATE TABLE attachments (
    id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
    record_id UUID NOT NULL REFERENCES records(id), field_id UUID NOT NULL REFERENCES fields(id),
    filename TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    sha256 TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attachments_record ON attachments(record_id);
CREATE TABLE views (
    id UUID PRIMARY KEY, form_id UUID NOT NULL REFERENCES forms(id), name TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}', is_default BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(form_id, name)
);
