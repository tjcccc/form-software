mod commands;
mod credentials;
use clap::Parser;
use commands::*;
use form_api_client::{Client, ClientError};
use form_domain::*;
use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::BTreeMap, io::Read, path::PathBuf};
use uuid::Uuid;
fn main() {
    let cli = Cli::parse();
    if let Err(error) = run(&cli) {
        if cli.json {
            let body = match &error {
                ClientError::Api { body, .. } => serde_json::to_value(body).unwrap_or(Value::Null),
                _ => json!({"code":"client","message":error.to_string(),"issues":[]}),
            };
            eprintln!("{body}");
        } else {
            eprintln!("formsw: {error}");
            if let ClientError::Api { body, .. } = &error {
                for issue in &body.issues {
                    eprintln!(
                        "  {}: {}",
                        issue.field_id.map(|id| id.to_string()).unwrap_or_default(),
                        issue.message
                    );
                }
            }
        }
        std::process::exit(match error.status() {
            Some(401 | 403) => 3,
            Some(409) => 4,
            Some(422) => 2,
            _ => 1,
        });
    }
}
fn run(cli: &Cli) -> Result<(), ClientError> {
    if let Command::Login { username } = &cli.command {
        let password = match std::env::var("FORM_PASSWORD") {
            Ok(password) => password,
            Err(_) => {
                if cli.json {
                    return Err(invalid("Headless login requires FORM_PASSWORD."));
                }
                rpassword::prompt_password("Password: ").map_err(|e| invalid(e.to_string()))?
            }
        };
        let client = Client::new(&cli.server, None)?;
        let result = client.login(&Login {
            username: username.clone(),
            password,
        })?;
        credentials::save(&cli.server, &result.token)?;
        return output(
            cli,
            &result.session,
            format!(
                "Signed in as {}. Token stored securely.",
                result.session.user.username
            ),
        );
    }
    let client = Client::new(&cli.server, Some(credentials::load(&cli.server)?))?;
    match &cli.command {
        Command::Login { .. } => {}
        Command::Workspace => {
            let result = client.session()?;
            output(
                cli,
                &result,
                format!("{} / {}", result.workspace.name, result.user.username),
            )?;
        }
        Command::Schema { form } => {
            let schema = resolve(&client, form)?;
            show_schema(cli, &schema)?;
        }
        Command::Forms { command } => match command {
            FormsCommand::List => {
                let forms = client.forms()?;
                let text = forms
                    .iter()
                    .map(|f| {
                        format!(
                            "{:<24} {:<28} {:>5}  {}",
                            f.key, f.name, f.record_count, f.id
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                output(cli, &forms, text)?;
            }
            FormsCommand::Show { form } => show_schema(cli, &resolve(&client, form)?)?,
            FormsCommand::Create {
                name,
                key,
                description,
                options,
            } => {
                let result: FormSchema = client.post(
                    "/forms",
                    &CreateForm {
                        key: key.clone(),
                        name: name.clone(),
                        description: description.clone(),
                        kind: if *options {
                            FormKind::Options
                        } else {
                            FormKind::Standard
                        },
                        icon: "table".into(),
                    },
                )?;
                show_schema(cli, &result)?;
            }
            FormsCommand::Update { form, input } => {
                let form = resolve(&client, form)?;
                let result: Form = client.patch(
                    &format!("/forms/{}", form.form.id),
                    &read_json::<UpdateForm>(input)?,
                )?;
                output(cli, &result, result.name.clone())?;
            }
        },
        Command::Fields { command } => match command {
            FieldsCommand::List { form } => show_schema(cli, &resolve(&client, form)?)?,
            FieldsCommand::Add { form, input } => {
                let schema = resolve(&client, form)?;
                let result: Field = client.post(
                    &format!("/forms/{}/fields", schema.form.id),
                    &read_json::<CreateField>(input)?,
                )?;
                output(cli, &result, result.id.to_string())?;
            }
            FieldsCommand::Update { field, input } => {
                let result: Field = client.patch(
                    &format!("/fields/{field}"),
                    &read_json::<UpdateField>(input)?,
                )?;
                output(cli, &result, result.id.to_string())?;
            }
        },
        Command::Records { command } => match command {
            RecordsCommand::List {
                form,
                search,
                filter,
                sort,
                descending,
                limit,
                cursor,
            } => {
                let schema = resolve(&client, form)?;
                let page = client.records(
                    schema.form.id,
                    &RecordQuery {
                        q: search.clone(),
                        filter: filter.clone(),
                        sort: *sort,
                        descending: *descending,
                        limit: Some(*limit),
                        cursor: *cursor,
                    },
                )?;
                let primary = schema.fields.iter().find(|f| f.key == "name");
                let mut text = page
                    .records
                    .iter()
                    .map(|r| {
                        format!(
                            "{}  v{:<3} {}",
                            r.id,
                            r.version,
                            primary
                                .and_then(|f| r.values.get(&f.id))
                                .and_then(Value::as_str)
                                .unwrap_or("Untitled")
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                text.push_str(&format!(
                    "\n{} records; next cursor: {}",
                    page.total,
                    page.next_cursor
                        .map(|v| v.to_string())
                        .unwrap_or("none".into())
                ));
                output(cli, &page, text)?;
            }
            RecordsCommand::Get { record } => {
                let result = client.record(*record)?;
                output(
                    cli,
                    &result,
                    serde_json::to_string_pretty(&result).map_err(|e| invalid(e.to_string()))?,
                )?;
            }
            RecordsCommand::Add { form, input, data } => {
                let schema = resolve(&client, form)?;
                let values = record_values(&schema, input.as_ref(), data.as_deref())?;
                let result = client.create_record(schema.form.id, values)?;
                output(
                    cli,
                    &result,
                    format!("Created {} (v{}).", result.id, result.version),
                )?;
            }
            RecordsCommand::Update {
                record,
                expected_version,
                input,
                data,
            } => {
                let current = client.record(*record)?;
                let schema = client.schema(current.form_id)?;
                let values = record_values(&schema, input.as_ref(), data.as_deref())?;
                let result = client.update_record(*record, values, *expected_version)?;
                output(
                    cli,
                    &result,
                    format!("Updated {} (v{}).", result.id, result.version),
                )?;
            }
            RecordsCommand::Archive {
                record,
                expected_version,
            } => {
                client.archive_record(*record, *expected_version)?;
                output(
                    cli,
                    &json!({"archived":record}),
                    format!("Archived {record}."),
                )?;
            }
        },
        Command::Attachments { command } => match command {
            AttachmentsCommand::Upload {
                record,
                field,
                file,
                expected_version,
            } => {
                let result = client.upload(*record, *field, *expected_version, file)?;
                output(
                    cli,
                    &result,
                    format!("Uploaded to {record} (v{}).", result.version),
                )?;
            }
            AttachmentsCommand::Download {
                attachment,
                output: path,
            } => {
                let bytes = client.download(*attachment)?;
                use std::io::Write;
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(path)
                    .map_err(|e| invalid(e.to_string()))?;
                file.write_all(&bytes).map_err(|e| invalid(e.to_string()))?;
                output(
                    cli,
                    &json!({"bytes":bytes.len()}),
                    format!("Downloaded {} bytes.", bytes.len()),
                )?;
            }
        },
        Command::Import {
            command:
                ImportCommand::Csv {
                    form,
                    file,
                    mapping,
                    commit,
                },
        } => {
            let schema = resolve(&client, form)?;
            let csv = std::fs::read_to_string(file).map_err(|e| invalid(e.to_string()))?;
            let columns = read_json::<BTreeMap<String, String>>(mapping)?;
            let mapping = columns
                .into_iter()
                .map(|(column, key)| {
                    schema
                        .fields
                        .iter()
                        .find(|f| f.key == key || f.id.to_string() == key)
                        .map(|f| ImportMapping {
                            column,
                            field_id: f.id,
                        })
                        .ok_or_else(|| invalid(format!("Unknown field: {key}")))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let input = ImportRequest {
                form_id: schema.form.id,
                csv,
                mapping,
            };
            if *commit {
                let result: ImportResult = client.post("/imports/csv/commit", &input)?;
                output(
                    cli,
                    &result,
                    format!("Imported {} records.", result.created),
                )?;
            } else {
                let result: ImportPreview = client.post("/imports/csv/preview", &input)?;
                let text =
                    serde_json::to_string_pretty(&result).map_err(|e| invalid(e.to_string()))?;
                output(cli, &result, text)?;
                if !result.valid {
                    return Err(invalid("Preview contains invalid rows; nothing imported."));
                }
            }
        }
    }
    Ok(())
}
fn resolve(client: &Client, key: &str) -> Result<FormSchema, ClientError> {
    if let Ok(id) = Uuid::parse_str(key) {
        return client.schema(id);
    }
    let form = client
        .forms()?
        .into_iter()
        .find(|f| f.key == key)
        .ok_or_else(|| invalid(format!("Unknown form key: {key}")))?;
    client.schema(form.id)
}
fn show_schema(cli: &Cli, schema: &FormSchema) -> Result<(), ClientError> {
    let mut text = format!("{} / {}\n", schema.form.name, schema.form.key);
    for f in &schema.fields {
        text.push_str(&format!(
            "{:<20} {:<14} {}{}  {}\n",
            f.key,
            format!("{:?}", f.field_type),
            f.name,
            if f.required { " *" } else { "" },
            f.id
        ));
    }
    output(cli, schema, text)
}
fn output(cli: &Cli, value: &impl Serialize, text: String) -> Result<(), ClientError> {
    if cli.json {
        println!(
            "{}",
            serde_json::to_string(value).map_err(|e| invalid(e.to_string()))?
        );
    } else {
        println!("{text}");
    }
    Ok(())
}
fn invalid(message: impl Into<String>) -> ClientError {
    ClientError::Invalid(message.into())
}
fn read_json<T: serde::de::DeserializeOwned>(path: &std::path::Path) -> Result<T, ClientError> {
    let source = if path == std::path::Path::new("-") {
        let mut input = String::new();
        std::io::stdin()
            .read_to_string(&mut input)
            .map_err(|e| invalid(e.to_string()))?;
        input
    } else {
        std::fs::read_to_string(path).map_err(|e| invalid(e.to_string()))?
    };
    serde_json::from_str(&source).map_err(|e| invalid(e.to_string()))
}
fn record_values(
    schema: &FormSchema,
    input: Option<&PathBuf>,
    data: Option<&str>,
) -> Result<Values, ClientError> {
    let source: BTreeMap<String, Value> = if let Some(path) = input {
        read_json(path)?
    } else if let Some(data) = data {
        serde_json::from_str(data).map_err(|e| invalid(e.to_string()))?
    } else {
        return Err(invalid(
            "Supply --input FILE|- or --data JSON. Values may use field keys or UUIDs.",
        ));
    };
    let mut values = Values::new();
    for (key, value) in source {
        let field = schema
            .fields
            .iter()
            .find(|f| f.key == key || f.id.to_string() == key)
            .ok_or_else(|| invalid(format!("Unknown field: {key}")))?;
        if values.insert(field.id, value).is_some() {
            return Err(invalid("A field was supplied more than once."));
        }
    }
    Ok(values)
}
