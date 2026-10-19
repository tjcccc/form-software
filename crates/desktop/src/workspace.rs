mod render;
use form_api_client::{Client, ClientError};
use form_domain::*;
use gpui::{App, Context, Entity, SharedString, Window, div, prelude::*, px, rgb};
use gpui_component::{
    Disableable,
    button::{Button, ButtonVariants},
    input::{Input, InputState},
};
use serde_json::{Value, json};
use uuid::Uuid;
const INK: u32 = 0x292c29;
const MUTED: u32 = 0x818874;
const LINE: u32 = 0xd8d9cf;

enum Job {
    SignedIn(Client, SessionInfo, Vec<Form>),
    Loaded(FormSchema, RecordPage),
    Saved(Record),
}
struct Editor {
    field: Field,
    input: Entity<InputState>,
}
pub struct Desktop {
    server: Entity<InputState>,
    username: Entity<InputState>,
    password: Entity<InputState>,
    client: Option<Client>,
    session: Option<SessionInfo>,
    forms: Vec<Form>,
    schema: Option<FormSchema>,
    records: Vec<Record>,
    editing: Option<Option<Record>>,
    editors: Vec<Editor>,
    busy: bool,
    status: String,
}
impl Desktop {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let server = std::env::var("FORM_SERVER").unwrap_or_else(|_| "http://127.0.0.1:3141".into());
        let mut app = Self {
            server: input(&server, "Server origin", false, window, cx),
            username: input("owner", "Username", false, window, cx),
            password: cx.new(|cx| InputState::new(window, cx).masked(true).placeholder("Password")),
            client: None,
            session: None,
            forms: vec![],
            schema: None,
            records: vec![],
            editing: None,
            editors: vec![],
            busy: false,
            status: "A considered place for your records.".into(),
        };
        if let Ok(token) = std::env::var("FORM_TOKEN") {
            app.sign_in_token(server, token, window, cx);
        }
        app
    }
    fn job(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        work: impl FnOnce() -> Result<Job, ClientError> + Send + 'static,
    ) {
        self.busy = true;
        self.status = "Connecting…".into();
        cx.notify();
        let this = cx.entity().downgrade();
        window
            .spawn(cx, async move |cx| {
                let result = cx
                    .background_spawn(async move { work().map_err(|e| e.to_string()) })
                    .await;
                let _ = cx.update(|window, cx| {
                    let _ = this.update(cx, |app, cx| {
                        app.busy = false;
                        match result {
                            Ok(Job::SignedIn(client, session, forms)) => {
                                app.client = Some(client);
                                app.session = Some(session);
                                app.forms = forms;
                                app.password.update(cx, |state, cx| state.set_value("", window, cx));
                                if let Some(id) = app
                                    .forms
                                    .iter()
                                    .find(|f| f.kind == FormKind::Standard)
                                    .or(app.forms.first())
                                    .map(|f| f.id)
                                {
                                    app.load(id, window, cx);
                                } else {
                                    app.status = "Create a form in the web workspace to get started.".into();
                                }
                            }
                            Ok(Job::Loaded(schema, page)) => {
                                app.schema = Some(schema);
                                app.records = page.records;
                                app.editing = None;
                                app.editors.clear();
                                app.status = format!("{} records · connected to the shared API", page.total);
                            }
                            Ok(Job::Saved(record)) => {
                                if let Some(index) = app.records.iter().position(|r| r.id == record.id) {
                                    app.records[index] = record.clone();
                                } else {
                                    app.records.insert(0, record.clone());
                                }
                                app.status = format!("Saved through the API · version {}", record.version);
                                app.editing = Some(Some(record));
                            }
                            Err(error) => {
                                app.status = error;
                            }
                        }
                        cx.notify();
                    });
                });
            })
            .detach();
    }
    fn sign_in_token(&mut self, server: String, token: String, window: &mut Window, cx: &mut Context<Self>) {
        self.job(window, cx, move || {
            let client = Client::new(&server, Some(token))?;
            let session = client.session()?;
            let forms = client.forms()?;
            Ok(Job::SignedIn(client, session, forms))
        });
    }
    fn login(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let server = self.server.read(cx).value().to_string();
        let username = self.username.read(cx).value().to_string();
        let password = self.password.read(cx).value().to_string();
        self.job(window, cx, move || {
            let result = Client::new(&server, None)?.login(&Login { username, password })?;
            let client = Client::new(&server, Some(result.token))?;
            let forms = client.forms()?;
            Ok(Job::SignedIn(client, result.session, forms))
        });
    }
    fn load(&mut self, id: Uuid, window: &mut Window, cx: &mut Context<Self>) {
        let Some(client) = self.client.clone() else {
            return;
        };
        self.job(window, cx, move || {
            let schema = client.schema(id)?;
            let page = client.records(
                id,
                &RecordQuery {
                    limit: Some(100),
                    ..Default::default()
                },
            )?;
            Ok(Job::Loaded(schema, page))
        });
    }
    fn inspect(&mut self, record: Option<Record>, window: &mut Window, cx: &mut Context<Self>) {
        if self.editing.is_some() {
            self.status = "Close the current inspector before opening another record.".into();
            cx.notify();
            return;
        }
        let Some(schema) = &self.schema else {
            return;
        };
        self.editors = schema
            .fields
            .iter()
            .filter(|f| f.archived_at.is_none() && f.field_type != FieldType::Attachment)
            .map(|field| {
                let value = record.as_ref().and_then(|r| r.values.get(&field.id));
                let text = match value {
                    Some(Value::String(text)) => text.clone(),
                    Some(Value::Null) | None => {
                        if field.field_type == FieldType::Date {
                            chrono::Local::now().format("%Y-%m-%d").to_string()
                        } else {
                            String::new()
                        }
                    }
                    Some(value) => value.to_string(),
                };
                Editor {
                    field: field.clone(),
                    input: input(&text, &field.name, field.field_type == FieldType::LongText, window, cx),
                }
            })
            .collect();
        self.editing = Some(record);
        self.status = "Edit fields, then save. Relations accept a JSON array of record UUIDs.".into();
        cx.notify();
    }
    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (Some(client), Some(schema)) = (self.client.clone(), &self.schema) else {
            return;
        };
        let mut values = Values::new();
        for editor in &self.editors {
            let text = editor.input.read(cx).value().to_string();
            let value = if text.is_empty() {
                Value::Null
            } else {
                match editor.field.field_type {
                    FieldType::Integer | FieldType::Duration | FieldType::Boolean | FieldType::Relation => {
                        match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => {
                                self.status = format!("{}: enter valid JSON for this field type.", editor.field.name);
                                cx.notify();
                                return;
                            }
                        }
                    }
                    _ => json!(text),
                }
            };
            values.insert(editor.field.id, value);
        }
        let form_id = schema.form.id;
        let current = self.editing.as_ref().and_then(Clone::clone);
        self.job(window, cx, move || {
            let record = if let Some(record) = current {
                client.update_record(record.id, values, record.version)?
            } else {
                client.create_record(form_id, values)?
            };
            Ok(Job::Saved(record))
        });
    }
    fn close_inspector(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.dirty(cx) {
            self.editing = None;
            self.editors.clear();
            cx.notify();
            return;
        }
        let answer = window.prompt(
            gpui::PromptLevel::Warning,
            "Discard unsaved changes?",
            Some("Your saved record will remain unchanged."),
            &["Keep editing", "Discard"],
            cx,
        );
        cx.spawn(async move |this, cx| {
            if answer.await == Ok(1) {
                let _ = this.update(cx, |app, cx| {
                    app.editing = None;
                    app.editors.clear();
                    cx.notify();
                });
            }
        })
        .detach();
    }
    fn dirty(&self, cx: &App) -> bool {
        let Some(editing) = &self.editing else {
            return false;
        };
        self.editors.iter().any(|e| {
            let original = editing.as_ref().and_then(|r| r.values.get(&e.field.id));
            let text = match original {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Null) | None => String::new(),
                Some(v) => v.to_string(),
            };
            e.input.read(cx).value().as_ref() != text
        })
    }
}
fn input(
    text: &str,
    placeholder: &str,
    multiline: bool,
    window: &mut Window,
    cx: &mut Context<Desktop>,
) -> Entity<InputState> {
    let value = text.to_owned();
    let placeholder = placeholder.to_owned();
    cx.new(|cx| {
        let mut state = InputState::new(window, cx)
            .placeholder(placeholder)
            .multi_line(multiline);
        state.set_value(value, window, cx);
        state
    })
}
fn record_title(record: &Record, schema: &FormSchema) -> String {
    schema
        .fields
        .iter()
        .find(|f| f.key == "name")
        .and_then(|f| record.values.get(&f.id))
        .and_then(Value::as_str)
        .unwrap_or("Untitled")
        .into()
}
