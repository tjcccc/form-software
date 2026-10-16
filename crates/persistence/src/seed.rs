use crate::*;
use serde_json::json;

/// Synthetic fixtures only. Never reads or imports the owner's real Airtable data.
pub async fn seed_demo(store: &Store, actor: Actor) -> Result<()> {
    if !store.forms(actor).await?.is_empty() {
        return Ok(());
    }
    let work = make_form(
        store,
        actor,
        "work_logs",
        "Work Logs",
        "The work, the thinking, and the things shipped.",
        "briefcase",
        FormKind::Standard,
    )
    .await?;
    let play = make_form(
        store,
        actor,
        "playing_logs",
        "Playing Logs",
        "Worlds explored. Small victories remembered.",
        "gamepad",
        FormKind::Standard,
    )
    .await?;
    let projects = make_form(
        store,
        actor,
        "projects",
        "Projects",
        "An index of ongoing and completed projects.",
        "folder",
        FormKind::Standard,
    )
    .await?;
    let organizations = make_form(
        store,
        actor,
        "organizations",
        "Organizations",
        "The people and places behind the work.",
        "building",
        FormKind::Standard,
    )
    .await?;
    let types = make_form(
        store,
        actor,
        "work_types",
        "Work Types",
        "Reusable choices for classifying work.",
        "tag",
        FormKind::Options,
    )
    .await?;
    let games = make_form(
        store,
        actor,
        "games",
        "Games",
        "A personal library of playable worlds.",
        "book",
        FormKind::Standard,
    )
    .await?;
    let org_name = organizations.fields[0].id;
    let org = store
        .create_record(
            actor,
            organizations.form.id,
            CreateRecord {
                values: [(org_name, json!("Personal"))].into(),
            },
        )
        .await?;
    let project_org = add(
        store,
        actor,
        &projects,
        "organization",
        "Organization",
        FieldType::Relation,
        relation(organizations.form.id, Cardinality::One),
    )
    .await?;
    add(
        store,
        actor,
        &projects,
        "status",
        "Status",
        FieldType::ShortText,
        FieldConfig::default(),
    )
    .await?;
    add(
        store,
        actor,
        &projects,
        "description",
        "Description",
        FieldType::LongText,
        FieldConfig::default(),
    )
    .await?;
    let mut project_ids = Vec::new();
    for name in ["FormSoftware", "Personal website", "Learning journal"] {
        let record = store
            .create_record(
                actor,
                projects.form.id,
                CreateRecord {
                    values: [
                        (projects.fields[0].id, json!(name)),
                        (project_org.id, json!([org.id])),
                    ]
                    .into(),
                },
            )
            .await?;
        project_ids.push(record.id);
    }
    let mut type_ids = Vec::new();
    for (name, color) in [
        ("Development", "blue"),
        ("Design", "purple"),
        ("Research", "ochre"),
        ("Planning", "green"),
    ] {
        let values = types
            .fields
            .iter()
            .map(|f| {
                (
                    f.id,
                    match f.key.as_str() {
                        "name" => json!(name),
                        "color" => json!(color),
                        "enabled" => json!(true),
                        _ => json!(type_ids.len()),
                    },
                )
            })
            .collect();
        type_ids.push(
            store
                .create_record(actor, types.form.id, CreateRecord { values })
                .await?
                .id,
        );
    }
    let mut game_ids = Vec::new();
    for name in ["Elden Ring", "Hollow Knight", "Disco Elysium"] {
        game_ids.push(
            store
                .create_record(
                    actor,
                    games.form.id,
                    CreateRecord {
                        values: [(games.fields[0].id, json!(name))].into(),
                    },
                )
                .await?
                .id,
        );
    }
    let date = add(
        store,
        actor,
        &work,
        "date",
        "Date",
        FieldType::Date,
        FieldConfig::default(),
    )
    .await?;
    let kind = add(
        store,
        actor,
        &work,
        "type",
        "Type",
        FieldType::Relation,
        relation(types.form.id, Cardinality::One),
    )
    .await?;
    let project = add(
        store,
        actor,
        &work,
        "project",
        "Project",
        FieldType::Relation,
        relation(projects.form.id, Cardinality::One),
    )
    .await?;
    let duration = add(
        store,
        actor,
        &work,
        "duration",
        "Duration",
        FieldType::Duration,
        FieldConfig::default(),
    )
    .await?;
    let memo = add(
        store,
        actor,
        &work,
        "memo",
        "Notes",
        FieldType::LongText,
        FieldConfig::default(),
    )
    .await?;
    add(
        store,
        actor,
        &work,
        "organization",
        "Organization",
        FieldType::Relation,
        relation(organizations.form.id, Cardinality::One),
    )
    .await?;
    add(
        store,
        actor,
        &work,
        "attachments",
        "Attachments",
        FieldType::Attachment,
        FieldConfig::default(),
    )
    .await?;
    store
        .update_field(
            actor,
            work.fields[0].id,
            UpdateField {
                name: Some("Summary".into()),
                ..Default::default()
            },
        )
        .await?;
    let entries = [
        (
            "2026-10-15",
            "Explore a quieter kind of software",
            1,
            0,
            90,
            "A structured workspace with the rhythm of a terminal. Keep the canvas open, the hierarchy clear, and the details intentional.",
        ),
        (
            "2026-10-15",
            "Define the record and field model",
            3,
            0,
            120,
            "Stable field IDs, explicit relationships, and one authoritative API across every client.",
        ),
        (
            "2026-10-14",
            "Build the first workspace layout",
            0,
            0,
            150,
            "Navigation on the left. Records at the center. An inspector that keeps the surrounding context intact.",
        ),
        (
            "2026-10-14",
            "Study terminal interface patterns",
            2,
            0,
            75,
            "Looked at typography, focus states, borders, and information density. Nostalgia should earn its place through usability.",
        ),
        (
            "2026-10-13",
            "Refine the project index",
            1,
            1,
            60,
            "Simplify the index and give each project a clear entry point.",
        ),
        (
            "2026-10-13",
            "Implement schema validation",
            0,
            0,
            180,
            "Keep validation on the server. Return actionable errors next to the relevant fields.",
        ),
        (
            "2026-10-12",
            "Read about PostgreSQL JSONB indexing",
            2,
            0,
            90,
            "Start with the actual query patterns. Add expression indexes when measurements justify them.",
        ),
        (
            "2026-10-12",
            "Sketch the record inspector",
            1,
            0,
            105,
            "Editing should feel calm and predictable. Make save state explicit.",
        ),
        (
            "2026-10-11",
            "Write up this week's observations",
            3,
            2,
            45,
            "Small, regular entries make the learning visible.",
        ),
        (
            "2026-10-11",
            "Audit keyboard navigation",
            0,
            1,
            80,
            "Visible focus, sensible tab order, and an obvious way out of every panel.",
        ),
        (
            "2026-10-10",
            "Map the first end-to-end workflow",
            3,
            0,
            60,
            "Create a record, find it again, make a correction. Make that loop excellent first.",
        ),
        (
            "2026-10-10",
            "Experiment with a typographic palette",
            1,
            0,
            95,
            "IBM Plex Sans for reading, Plex Mono for the structure. Warm paper and a small amount of vermilion.",
        ),
    ];
    for (day, title, t, p, minutes, note) in entries.into_iter().rev() {
        store
            .create_record(
                actor,
                work.form.id,
                CreateRecord {
                    values: [
                        (work.fields[0].id, json!(title)),
                        (date.id, json!(day)),
                        (kind.id, json!([type_ids[t]])),
                        (project.id, json!([project_ids[p]])),
                        (duration.id, json!(minutes)),
                        (memo.id, json!(note)),
                    ]
                    .into(),
                },
            )
            .await?;
    }
    let play_date = add(
        store,
        actor,
        &play,
        "date",
        "Date",
        FieldType::Date,
        FieldConfig::default(),
    )
    .await?;
    let game = add(
        store,
        actor,
        &play,
        "game",
        "Game",
        FieldType::Relation,
        relation(games.form.id, Cardinality::One),
    )
    .await?;
    let play_duration = add(
        store,
        actor,
        &play,
        "duration",
        "Duration",
        FieldType::Duration,
        FieldConfig::default(),
    )
    .await?;
    let play_notes = add(
        store,
        actor,
        &play,
        "notes",
        "Notes",
        FieldType::LongText,
        FieldConfig::default(),
    )
    .await?;
    for (day, title, g, minutes, note) in [
        (
            "2026-10-14",
            "A detour through the Lands Between",
            0,
            110,
            "Followed an unmarked path and found a quiet corner worth remembering.",
        ),
        (
            "2026-10-13",
            "Back to Greenpath",
            1,
            65,
            "A little exploration, a little practice. The soundtrack still does all the heavy lifting.",
        ),
        (
            "2026-10-11",
            "Conversations in Martinaise",
            2,
            90,
            "Took the long way through the dialogue. No regrets.",
        ),
    ] {
        store
            .create_record(
                actor,
                play.form.id,
                CreateRecord {
                    values: [
                        (play.fields[0].id, json!(title)),
                        (play_date.id, json!(day)),
                        (game.id, json!([game_ids[g]])),
                        (play_duration.id, json!(minutes)),
                        (play_notes.id, json!(note)),
                    ]
                    .into(),
                },
            )
            .await?;
    }
    Ok(())
}
fn relation(target: Uuid, cardinality: Cardinality) -> FieldConfig {
    FieldConfig {
        target_form_id: Some(target),
        cardinality: Some(cardinality),
        presentation: Some(Presentation::Select),
        ..Default::default()
    }
}
async fn make_form(
    store: &Store,
    actor: Actor,
    key: &str,
    name: &str,
    description: &str,
    icon: &str,
    kind: FormKind,
) -> Result<FormSchema> {
    store
        .create_form(
            actor,
            CreateForm {
                key: key.into(),
                name: name.into(),
                description: description.into(),
                icon: icon.into(),
                kind,
            },
        )
        .await
}
async fn add(
    store: &Store,
    actor: Actor,
    form: &FormSchema,
    key: &str,
    name: &str,
    field_type: FieldType,
    config: FieldConfig,
) -> Result<Field> {
    store
        .create_field(
            actor,
            form.form.id,
            CreateField {
                description: String::new(),
                position: None,
                key: key.into(),
                name: name.into(),
                field_type,
                required: false,
                config,
            },
        )
        .await
}
