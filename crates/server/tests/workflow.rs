//! One focused HTTP integration scenario against a fresh SQLx-managed disposable database.
// Integration-test helpers intentionally fail immediately on invalid fixtures or responses.
#![allow(clippy::expect_used)]

use form_domain::*;
use reqwest::{Client, Method, StatusCode};
use serde_json::{Value, json};
use sqlx::{ConnectOptions, PgPool};
use std::{
    process::{Child, Command, Stdio},
    time::Duration,
};
use uuid::Uuid;
struct Server(Child);
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
struct Api {
    client: Client,
    base: String,
    token: String,
}
impl Api {
    async fn request(&self, method: Method, path: &str, body: Value) -> reqwest::Response {
        let request = self
            .client
            .request(method, format!("{}{path}", self.base))
            .bearer_auth(&self.token);
        request.json(&body).send().await.expect("HTTP request")
    }
    async fn ok<T: serde::de::DeserializeOwned>(&self, method: Method, path: &str, body: Value) -> T {
        let response = self.request(method, path, body).await;
        let status = response.status();
        let value: Value = response.json().await.expect("JSON response");
        assert!(status.is_success(), "{path}: {status} {value}");
        serde_json::from_value(value).expect("response contract")
    }
    async fn form(&self, key: &str, kind: &str) -> FormSchema {
        self.ok(Method::POST, "/api/v1/forms", json!({"key":key,"name":key,"kind":kind}))
            .await
    }
    async fn field(&self, form: Uuid, key: &str, kind: &str, config: Value) -> Field {
        self.ok(
            Method::POST,
            &format!("/api/v1/forms/{form}/fields"),
            json!({"key":key,"name":key,"type":kind,"config":config}),
        )
        .await
    }
    async fn filtered(&self, form: Uuid, filters: Value) -> reqwest::Response {
        self.client
            .get(format!("{}/api/v1/forms/{form}/records", self.base))
            .bearer_auth(&self.token)
            .query(&[("filter", filters.to_string())])
            .send()
            .await
            .expect("filtered request")
    }
    async fn create(&self, form: Uuid, values: Value) -> Record {
        self.ok(
            Method::POST,
            &format!("/api/v1/forms/{form}/records"),
            json!({"values":values}),
        )
        .await
    }
}
/// Starts the server against the disposable test database and signs in as its owner.
async fn start(pool: &PgPool) -> (Server, Api, LoginResult, String, std::path::PathBuf) {
    let options = pool.connect_options();
    let db = options.get_database().expect("test database");
    assert!(
        db.starts_with("_sqlx_test"),
        "This test only uses a SQLx-managed disposable database."
    );
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("port");
    let port = listener.local_addr().expect("address").port();
    drop(listener);
    let password = Uuid::new_v4().to_string();
    let storage = std::env::temp_dir().join(format!("formsw-test-{}", Uuid::new_v4()));
    let server = Server(
        Command::new(env!("CARGO_BIN_EXE_form-server"))
            .env("DATABASE_URL", options.to_url_lossy().as_str())
            .env("FORM_BIND", format!("127.0.0.1:{port}"))
            .env("FORM_USERNAME", "integration_owner")
            .env("FORM_PASSWORD", &password)
            .env("FORM_SEED_DEMO", "false")
            .env("FORM_STORAGE", &storage)
            .env("FORM_ORIGIN", format!("http://127.0.0.1:{port}"))
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("server"),
    );
    let client = Client::new();
    let base = format!("http://127.0.0.1:{port}");
    for attempt in 0..100 {
        if client.get(format!("{base}/health")).send().await.is_ok() {
            break;
        }
        assert!(attempt < 99, "server startup");
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(
        client
            .get(format!("{base}/api/v1/forms"))
            .send()
            .await
            .expect("request")
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let login: LoginResult = client
        .post(format!("{base}/api/v1/auth/login"))
        .json(&json!({"username":"integration_owner","password":password}))
        .send()
        .await
        .expect("login")
        .json()
        .await
        .expect("login contract");
    let api = Api {
        client,
        base,
        token: login.token.clone(),
    };
    (server, api, login, password, storage)
}
/// Creates a second workspace with its own owner, who must not see the first workspace's resources.
async fn second_workspace(pool: &PgPool, api: &Api, login: &LoginResult, password: &str) -> Api {
    let other_user = Uuid::new_v4();
    let other_workspace = Uuid::new_v4();
    sqlx::query("INSERT INTO users(id,username,password_hash) SELECT $1,'other',password_hash FROM users WHERE id=$2")
        .bind(other_user)
        .bind(login.session.user.id)
        .execute(pool)
        .await
        .expect("other user");
    sqlx::query("INSERT INTO workspaces(id,slug,name) VALUES($1,'other','Other')")
        .bind(other_workspace)
        .execute(pool)
        .await
        .expect("other workspace");
    sqlx::query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')")
        .bind(other_workspace)
        .bind(other_user)
        .execute(pool)
        .await
        .expect("membership");
    let other: LoginResult = api
        .client
        .post(format!("{}/api/v1/auth/login", api.base))
        .json(&json!({"username":"other","password":password}))
        .send()
        .await
        .expect("other login")
        .json()
        .await
        .expect("other login contract");
    Api {
        client: api.client.clone(),
        base: api.base.clone(),
        token: other.token,
    }
}
#[sqlx::test(migrations = "../persistence/migrations")]
async fn authenticated_record_workflow(pool: PgPool) {
    let (_server, api, login, password, storage) = start(&pool).await;
    let client = api.client.clone();
    let base = api.base.clone();
    let work = api.form("work", "standard").await;
    let options = api.form("types", "options").await;
    let projects = api.form("projects", "standard").await;
    let name = work.fields[0].id;
    let duration = api.field(work.form.id, "duration", "duration", json!({})).await;
    let relation = api
        .field(
            work.form.id,
            "type",
            "relation",
            json!({"target_form_id":options.form.id,"cardinality":"one","presentation":"select"}),
        )
        .await;
    let attachment = api.field(work.form.id, "files", "attachment", json!({})).await;
    let enabled = options.fields.iter().find(|f| f.key == "enabled").expect("enabled").id;
    let option = api
        .create(
            options.form.id,
            json!({options.fields[0].id.to_string():"Development",enabled.to_string():true}),
        )
        .await;
    let project = api
        .create(
            projects.form.id,
            json!({projects.fields[0].id.to_string():"FormSoftware"}),
        )
        .await;
    let record = api
        .create(
            work.form.id,
            json!({name.to_string():"First entry",duration.id.to_string():60,relation.id.to_string():[option.id]}),
        )
        .await;
    let path = format!("/api/v1/records/{}", record.id);
    let raw: Value = sqlx::query_scalar("SELECT data FROM records WHERE id=$1")
        .bind(record.id)
        .fetch_one(&pool)
        .await
        .expect("raw record");
    assert!(
        raw.get(relation.id.to_string()).is_none(),
        "Relations are canonical outside JSONB"
    );
    for values in [
        json!({duration.id.to_string():-1}),
        json!({Uuid::new_v4().to_string():"unknown"}),
        json!({name.to_string():"should roll back",relation.id.to_string():[project.id]}),
    ] {
        let response = api
            .request(Method::PATCH, &path, json!({"expected_version":1,"values":values}))
            .await;
        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }
    let after: Record = api.ok(Method::GET, &path, Value::Null).await;
    assert_eq!(after.version, 1);
    assert_eq!(after.values[&name], "First entry");
    let body = json!({"expected_version":1,"values":{duration.id.to_string():90}});
    let (first, second) = tokio::join!(
        api.request(Method::PATCH, &path, body.clone()),
        api.request(Method::PATCH, &path, body)
    );
    let statuses = [first.status().as_u16(), second.status().as_u16()];
    assert!(statuses.contains(&200) && statuses.contains(&409));
    let updated: Record = api.ok(Method::GET, &path, Value::Null).await;
    assert_eq!(updated.version, 2);
    let _: Field = api
        .ok(
            Method::PATCH,
            &format!("/api/v1/fields/{name}"),
            json!({"name":"Summary"}),
        )
        .await;
    let _:Record=api.ok(Method::PATCH,&format!("/api/v1/records/{}",option.id),json!({"expected_version":1,"values":{options.fields[0].id.to_string():"Engineering",enabled.to_string():false}})).await;
    let preserved: Record = api
        .ok(
            Method::PATCH,
            &path,
            json!({"expected_version":2,"values":{name.to_string():"Edited entry"}}),
        )
        .await;
    assert_eq!(preserved.values[&relation.id], json!([option.id]));
    let response = api
        .request(
            Method::POST,
            &format!("/api/v1/forms/{}/records", work.form.id),
            json!({"values":{name.to_string():"New",relation.id.to_string():[option.id]}}),
        )
        .await;
    assert_eq!(
        response.status(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "Disabled options cannot be newly assigned"
    );
    assert_eq!(
        api.request(
            Method::DELETE,
            &format!("/api/v1/records/{}", option.id),
            json!({"expected_version":2})
        )
        .await
        .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let filter = serde_json::to_string(&vec![Filter {
        field_id: duration.id,
        op: FilterOp::Gte,
        value: json!(90),
    }])
    .expect("filter");
    let page: RecordPage = client
        .get(format!("{base}/api/v1/forms/{}/records", work.form.id))
        .bearer_auth(&api.token)
        .query(&[("filter", filter), ("cursor", "100".into())])
        .send()
        .await
        .expect("page")
        .json()
        .await
        .expect("page contract");
    assert_eq!(page.total, 1);
    assert!(page.records.is_empty());
    let part = reqwest::multipart::Part::bytes(b"integration attachment".to_vec()).file_name("notes.txt");
    let attached: Record = client
        .post(format!("{base}{path}/attachments"))
        .bearer_auth(&api.token)
        .query(&[
            ("field_id", attachment.id.to_string()),
            ("expected_version", preserved.version.to_string()),
        ])
        .multipart(reqwest::multipart::Form::new().part("file", part))
        .send()
        .await
        .expect("upload")
        .json()
        .await
        .expect("upload contract");
    let file = &attached.attachments[0];
    assert_eq!(attached.version, preserved.version + 1);
    let download = client
        .get(format!("{base}/api/v1/attachments/{}", file.id))
        .bearer_auth(&api.token)
        .send()
        .await
        .expect("download");
    assert_eq!(download.bytes().await.expect("bytes"), "integration attachment");
    assert_eq!(
        client
            .get(format!("{base}/api/v1/attachments/{}", file.id))
            .send()
            .await
            .expect("private download")
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let mapping = json!([{"column":"Name","field_id":name},{"column":"Minutes","field_id":duration.id}]);
    let bad_import = json!({"form_id":work.form.id,"csv":"Name,Minutes\nGood,20\nBad,-5\n","mapping":mapping});
    let preview: ImportPreview = api
        .ok(Method::POST, "/api/v1/imports/csv/preview", bad_import.clone())
        .await;
    assert!(!preview.valid);
    assert_eq!(preview.rows.len(), 2);
    assert_eq!(
        api.request(Method::POST, "/api/v1/imports/csv/commit", bad_import)
            .await
            .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM records WHERE form_id=$1")
        .bind(work.form.id)
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(count, 1, "Invalid import is atomic");
    let result: ImportResult = api
        .ok(
            Method::POST,
            "/api/v1/imports/csv/commit",
            json!({"form_id":work.form.id,"csv":"Name,Minutes\nImported,20\n","mapping":mapping}),
        )
        .await;
    assert_eq!(result.created, 1);
    // Relative insertion is persisted, validated, and version checked.
    let insert_path = format!("{path}/insert");
    for (values, version, status) in [
        (json!({}), attached.version, StatusCode::UNPROCESSABLE_ENTITY),
        (json!({name.to_string(): "stale"}), 1, StatusCode::CONFLICT),
    ] {
        assert_eq!(
            api.request(
                Method::POST,
                &insert_path,
                json!({"values":values,"before":true,"expected_version":version})
            )
            .await
            .status(),
            status
        );
    }
    let above: Record = api
        .ok(
            Method::POST,
            &insert_path,
            json!({"values":{name.to_string():"Above"},"before":true,"expected_version":attached.version}),
        )
        .await;
    let below: Record = api
        .ok(
            Method::POST,
            &insert_path,
            json!({"values":{name.to_string():"Below"},"before":false,"expected_version":attached.version}),
        )
        .await;
    let order: RecordPage = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/records", work.form.id),
            Value::Null,
        )
        .await;
    let ids: Vec<_> = order.records.iter().map(|r| r.id).collect();
    assert!(ids.windows(3).any(|ids| ids == [above.id, attached.id, below.id]));
    // Invalid duplicate relations roll back metadata and clean up copied files.
    let files_before = std::fs::read_dir(&storage).expect("storage").count();
    assert_eq!(
        api.request(
            Method::POST,
            &format!("{path}/duplicate"),
            json!({"expected_version":attached.version})
        )
        .await
        .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(std::fs::read_dir(&storage).expect("storage").count(), files_before);
    let _: Record = api
        .ok(
            Method::PATCH,
            &format!("/api/v1/records/{}", option.id),
            json!({"expected_version":2,"values":{enabled.to_string():true}}),
        )
        .await;
    let duplicate: Record = api
        .ok(
            Method::POST,
            &format!("{path}/duplicate"),
            json!({"expected_version":attached.version}),
        )
        .await;
    assert_eq!(duplicate.values, attached.values);
    assert_eq!(duplicate.attachments.len(), 1);
    assert_ne!(duplicate.attachments[0].id, file.id);
    let order: RecordPage = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/records", work.form.id),
            Value::Null,
        )
        .await;
    let ids: Vec<_> = order.records.iter().map(|r| r.id).collect();
    assert!(
        ids.windows(4)
            .any(|ids| ids == [above.id, attached.id, duplicate.id, below.id])
    );
    let duplicate_file = duplicate.attachments[0].id;
    let bytes = api
        .client
        .get(format!("{base}/api/v1/attachments/{duplicate_file}"))
        .bearer_auth(&api.token)
        .send()
        .await
        .expect("copied file")
        .bytes()
        .await
        .expect("copied bytes");
    assert_eq!(bytes, "integration attachment");
    let _: Record = api
        .ok(
            Method::DELETE,
            &format!("/api/v1/attachments/{duplicate_file}"),
            json!({"expected_version":duplicate.version}),
        )
        .await;
    assert!(
        storage.join(file.id.to_string()).exists(),
        "Removing a duplicate attachment preserves the source file"
    );
    assert_eq!(
        api.request(
            Method::POST,
            &format!("{path}/duplicate"),
            json!({"expected_version":1})
        )
        .await
        .status(),
        StatusCode::CONFLICT
    );
    // A second workspace must not read, mutate, or reference the first workspace's resources.
    let other = second_workspace(&pool, &api, &login, &password).await;
    assert_eq!(
        other.request(Method::GET, &path, Value::Null).await.status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        other
            .request(
                Method::PATCH,
                &path,
                json!({"expected_version":attached.version,"values":{name.to_string():"intruder"}})
            )
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        other
            .request(Method::GET, &format!("/api/v1/attachments/{}", file.id), Value::Null)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    for (suffix, body) in [
        (
            "insert",
            json!({"values":{name.to_string():"intruder"},"before":true,"expected_version":attached.version}),
        ),
        ("duplicate", json!({"expected_version":attached.version})),
    ] {
        assert_eq!(
            other
                .request(Method::POST, &format!("{path}/{suffix}"), body)
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
    }
    let other_form = other.form("other_records", "standard").await;
    assert_eq!(other.request(Method::POST,&format!("/api/v1/forms/{}/fields",other_form.form.id),json!({"key":"forbidden","name":"Forbidden","type":"relation","config":{"target_form_id":options.form.id,"cardinality":"one","presentation":"select"}})).await.status(),StatusCode::UNPROCESSABLE_ENTITY);
    // Cookie writes require an exact Origin; bearer clients work without cookie CSRF rules.
    let cookie_response = api
        .client
        .patch(format!("{}{path}", api.base))
        .header("Cookie", format!("formsw_session={}", api.token))
        .header("Origin", "https://untrusted.invalid")
        .json(&json!({"expected_version":attached.version,"values":{}}))
        .send()
        .await
        .expect("CSRF request");
    assert_eq!(cookie_response.status(), StatusCode::FORBIDDEN);
    // Column metadata, global grouping before pagination, and typed/relation sorts.
    let described: Field = api.ok(Method::POST, &format!("/api/v1/forms/{}/fields", work.form.id), json!({"key":"column_notes","name":"Column notes","description":"Minutes spent, excluding breaks.","type":"long_text","position":0})).await;
    assert_eq!(described.position, 0);
    assert_eq!(described.description, "Minutes spent, excluding breaks.");
    assert_eq!(
        api.request(
            Method::PATCH,
            &format!("/api/v1/fields/{}", described.id),
            json!({"description":"x".repeat(4001)})
        )
        .await
        .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let grouped: RecordPage = api
        .ok(
            Method::GET,
            &format!(
                "/api/v1/forms/{}/records?group_by={}&limit=1",
                work.form.id, relation.id
            ),
            Value::Null,
        )
        .await;
    assert_eq!(grouped.records.len(), 1);
    assert_eq!(grouped.groups.len(), 1);
    assert_eq!(grouped.groups[0].value, json!([]));
    assert_eq!(
        grouped.groups[0].count, 3,
        "Group counts cover all matching rows, not just the page"
    );
    let grouped: RecordPage = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/records?group_by={}", work.form.id, relation.id),
            Value::Null,
        )
        .await;
    assert_eq!(grouped.groups.iter().map(|g| g.count).sum::<i64>(), grouped.total);
    let sorted: RecordPage = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/records?sort={}", work.form.id, relation.id),
            Value::Null,
        )
        .await;
    assert_eq!(sorted.records[0].values.get(&relation.id), Some(&json!([option.id])));
    let decimal = api.field(work.form.id, "column_decimal", "decimal", json!({})).await;
    for (id, value) in [(record.id, "2"), (above.id, "10"), (below.id, "1")] {
        let current: Record = api.ok(Method::GET, &format!("/api/v1/records/{id}"), Value::Null).await;
        let _: Record = api
            .ok(
                Method::PATCH,
                &format!("/api/v1/records/{id}"),
                json!({"expected_version":current.version,"values":{decimal.id.to_string():value}}),
            )
            .await;
    }
    let sorted: RecordPage = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/records?sort={}", work.form.id, decimal.id),
            Value::Null,
        )
        .await;
    assert_eq!(
        sorted.records.iter().take(3).map(|r| r.id).collect::<Vec<_>>(),
        vec![below.id, record.id, above.id]
    );
    let multi = api
        .field(
            work.form.id,
            "column_links",
            "relation",
            json!({"target_form_id":options.form.id,"cardinality":"many","presentation":"select"}),
        )
        .await;
    let alpha = api
        .create(
            options.form.id,
            json!({options.fields[0].id.to_string():"Alpha",enabled.to_string():true}),
        )
        .await;
    for (id, links) in [
        (record.id, vec![alpha.id, option.id]),
        (above.id, vec![option.id, alpha.id]),
    ] {
        let current: Record = api.ok(Method::GET, &format!("/api/v1/records/{id}"), Value::Null).await;
        let _: Record = api
            .ok(
                Method::PATCH,
                &format!("/api/v1/records/{id}"),
                json!({"expected_version":current.version,"values":{multi.id.to_string():links}}),
            )
            .await;
    }
    let filter =
        serde_json::to_string(&json!([{"field_id":multi.id,"op":"eq","value":alpha.id}])).expect("group filter");
    let grouped: RecordPage = api
        .client
        .get(format!("{}/api/v1/forms/{}/records", api.base, work.form.id))
        .bearer_auth(&api.token)
        .query(&[
            ("group_by", multi.id.to_string()),
            ("limit", "1".into()),
            ("filter", filter),
        ])
        .send()
        .await
        .expect("multi-link group")
        .json()
        .await
        .expect("group contract");
    assert_eq!(grouped.total, 2);
    assert_eq!(grouped.groups.len(), 1);
    assert_eq!(
        grouped.groups[0].count, 2,
        "The same set of links groups together regardless of selection order"
    );
    let grouped_desc: RecordPage = api
        .ok(
            Method::GET,
            &format!(
                "/api/v1/forms/{}/records?group_by={}&sort={}&descending=true&limit=1",
                work.form.id, relation.id, relation.id
            ),
            Value::Null,
        )
        .await;
    assert_eq!(
        grouped_desc.groups[0].value,
        json!([option.id]),
        "Sorting the grouping field also reverses group order"
    );
    // A field copy has a new stable ID and independently copied canonical data.
    let copied: Field = api
        .ok(
            Method::POST,
            &format!("/api/v1/fields/{}/duplicate", duration.id),
            Value::Null,
        )
        .await;
    let schema: FormSchema = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/schema", work.form.id),
            Value::Null,
        )
        .await;
    let old = schema
        .fields
        .iter()
        .position(|f| f.id == duration.id)
        .expect("source column");
    assert_eq!(schema.fields[old + 1].id, copied.id);
    let current: Record = api.ok(Method::GET, &path, Value::Null).await;
    assert_eq!(current.values[&copied.id], current.values[&duration.id]);
    let copied_relation: Field = api
        .ok(
            Method::POST,
            &format!("/api/v1/fields/{}/duplicate", relation.id),
            Value::Null,
        )
        .await;
    let current: Record = api.ok(Method::GET, &path, Value::Null).await;
    assert_eq!(current.values[&copied_relation.id], json!([option.id]));
    let copied_files: Field = api
        .ok(
            Method::POST,
            &format!("/api/v1/fields/{}/duplicate", attachment.id),
            Value::Null,
        )
        .await;
    let current: Record = api.ok(Method::GET, &path, Value::Null).await;
    let copied_file = current
        .attachments
        .iter()
        .find(|a| a.field_id == copied_files.id)
        .expect("copied file field");
    assert_ne!(copied_file.id, file.id);
    let bytes = api
        .client
        .get(format!("{}/api/v1/attachments/{}", api.base, copied_file.id))
        .bearer_auth(&api.token)
        .send()
        .await
        .expect("copied column file")
        .bytes()
        .await
        .expect("copied content");
    assert_eq!(bytes, "integration attachment");
    assert!(storage.join(file.id.to_string()).exists());
    assert_eq!(
        other
            .request(
                Method::POST,
                &format!("/api/v1/fields/{}/duplicate", duration.id),
                Value::Null
            )
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    // Saved view changes survive reload; deleting a field removes dangling configuration.
    let view: View = api.ok(Method::POST,&format!("/api/v1/forms/{}/views",work.form.id),json!({"name":"Column workflow","config":{"columns":[{"field_id":copied.id,"width":156,"hidden":false}],"filters":[{"field_id":copied.id,"op":"empty","value":null}],"sort":{"field_id":copied.id,"descending":false},"group_by":copied.id,"freeze_first":false}})).await;
    assert_eq!(view.config.group_by, Some(copied.id));
    assert!(!view.config.freeze_first);
    let _: Field = api
        .ok(
            Method::PATCH,
            &format!("/api/v1/fields/{}", copied.id),
            json!({"archived":true}),
        )
        .await;
    let views: Vec<View> = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/views", work.form.id),
            Value::Null,
        )
        .await;
    let view = views.iter().find(|v| v.name == "Column workflow").expect("saved view");
    assert!(
        view.config.columns.is_empty()
            && view.config.filters.is_empty()
            && view.config.sort.is_none()
            && view.config.group_by.is_none()
    );
    // Width-only writes preserve implicit order, visibility, and unrelated view preferences.
    let default = views.iter().find(|v| v.is_default).expect("default view");
    let width_path = format!("/api/v1/views/{}/columns/{}/width", default.id, duration.id);
    let resized: View = api.ok(Method::PATCH, &width_path, json!({"width":272})).await;
    let schema: FormSchema = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/schema", work.form.id),
            Value::Null,
        )
        .await;
    let active: Vec<_> = schema.fields.iter().filter(|f| f.archived_at.is_none()).collect();
    assert_eq!(
        resized.config.columns.iter().map(|c| c.field_id).collect::<Vec<_>>(),
        active.iter().map(|f| f.id).collect::<Vec<_>>()
    );
    assert!(resized.config.columns.iter().all(|c| !c.hidden));
    assert_eq!(
        resized
            .config
            .columns
            .iter()
            .find(|c| c.field_id == duration.id)
            .expect("resized column")
            .width,
        272
    );
    assert_eq!(
        resized
            .config
            .columns
            .iter()
            .find(|c| c.field_id == name)
            .expect("primary width")
            .width,
        350
    );
    for width in [99, 801] {
        assert_eq!(
            api.request(Method::PATCH, &width_path, json!({"width":width}))
                .await
                .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    assert_eq!(
        other
            .request(Method::PATCH, &width_path, json!({"width":300}))
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        api.request(
            Method::PATCH,
            &format!("/api/v1/views/{}/columns/{}/width", default.id, projects.fields[0].id),
            json!({"width":300})
        )
        .await
        .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        api.request(
            Method::PATCH,
            &format!("/api/v1/views/{}/columns/{}/width", default.id, copied.id),
            json!({"width":300})
        )
        .await
        .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let custom: View = api.ok(Method::POST,&format!("/api/v1/forms/{}/views",work.form.id),json!({"name":"Width isolation","config":{"columns":[{"field_id":relation.id,"width":180,"hidden":true}],"filters":[{"field_id":duration.id,"op":"gte","value":20}],"sort":{"field_id":duration.id,"descending":true},"group_by":relation.id,"freeze_first":false}})).await;
    let path_one = format!("/api/v1/views/{}/columns/{}/width", custom.id, name);
    let path_two = format!("/api/v1/views/{}/columns/{}/width", custom.id, duration.id);
    let (one, two) = tokio::join!(
        api.request(Method::PATCH, &path_one, json!({"width":310})),
        api.request(Method::PATCH, &path_two, json!({"width":240}))
    );
    assert!(one.status().is_success() && two.status().is_success());
    let loaded: Vec<View> = api
        .ok(
            Method::GET,
            &format!("/api/v1/forms/{}/views", work.form.id),
            Value::Null,
        )
        .await;
    let loaded = loaded.iter().find(|v| v.id == custom.id).expect("saved widths");
    assert_eq!(loaded.config.columns[0].field_id, relation.id);
    assert!(loaded.config.columns[0].hidden);
    assert_eq!(loaded.config.columns[0].width, 180);
    assert_eq!(
        loaded
            .config
            .columns
            .iter()
            .find(|c| c.field_id == name)
            .expect("name width")
            .width,
        310
    );
    assert_eq!(
        loaded
            .config
            .columns
            .iter()
            .find(|c| c.field_id == duration.id)
            .expect("duration width")
            .width,
        240
    );
    assert_eq!(
        serde_json::to_value(&loaded.config.filters).expect("filters"),
        serde_json::to_value(&custom.config.filters).expect("filters")
    );
    assert_eq!(
        loaded.config.sort.as_ref().map(|s| (s.field_id, s.descending)),
        custom.config.sort.as_ref().map(|s| (s.field_id, s.descending))
    );
    assert_eq!(loaded.config.group_by, custom.config.group_by);
    assert!(!loaded.config.freeze_first);
    // Full relation-filter semantics, including empties and multi-link overlap.
    let beta = api
        .create(
            options.form.id,
            json!({options.fields[0].id.to_string():"Beta",enabled.to_string():true}),
        )
        .await;
    let other_choice = api
        .create(
            work.form.id,
            json!({name.to_string():"Other choice",relation.id.to_string():[beta.id],multi.id.to_string():[beta.id]}),
        )
        .await;
    let mixed_choice = api.create(work.form.id,json!({name.to_string():"Mixed choices",relation.id.to_string():[option.id],multi.id.to_string():[option.id,beta.id]})).await;
    let _: Record = api
        .ok(
            Method::PATCH,
            &format!("/api/v1/records/{}", beta.id),
            json!({"expected_version":beta.version,"values":{enabled.to_string():false}}),
        )
        .await;
    for (op, value, total) in [
        ("eq", json!(alpha.id), 2),
        ("ne", json!(alpha.id), 5),
        ("any_of", json!([alpha.id, beta.id]), 4),
        ("none_of", json!([alpha.id, beta.id]), 3),
        ("empty", Value::Null, 3),
        ("not_empty", Value::Null, 4),
        ("contains", json!(alpha.id), 2),
    ] {
        let response = api
            .filtered(work.form.id, json!([{"field_id":multi.id,"op":op,"value":value}]))
            .await;
        assert!(response.status().is_success(), "Valid {op} relation filter");
        let page: RecordPage = response.json().await.expect("relation filter contract");
        assert_eq!(page.total, total, "{op} relation semantics");
        assert_eq!(
            page.records
                .iter()
                .map(|r| r.id)
                .collect::<std::collections::HashSet<_>>()
                .len(),
            page.records.len(),
            "Multi-link matches never duplicate rows"
        );
    }
    let page: RecordPage=api.filtered(work.form.id,json!([{"field_id":multi.id,"op":"ne","value":alpha.id},{"field_id":multi.id,"op":"not_empty","value":null}])).await.json().await.expect("combined filters");
    assert_eq!(page.total, 2);
    assert!(
        page.records.iter().any(|r| r.id == other_choice.id) && page.records.iter().any(|r| r.id == mixed_choice.id)
    );
    for (op, total) in [("ne", 5), ("not_empty", 3), ("empty", 4)] {
        let page: RecordPage = api
            .filtered(work.form.id, json!([{"field_id":duration.id,"op":op,"value":90}]))
            .await
            .json()
            .await
            .expect("scalar negatives");
        assert_eq!(page.total, total, "Scalar {op} handles missing values");
    }
    let _: Record = api
        .create(options.form.id, json!({options.fields[0].id.to_string():"Unset flag"}))
        .await;
    for (op, total) in [("eq", 1), ("ne", 3), ("empty", 1), ("not_empty", 3)] {
        let page: RecordPage = api
            .filtered(options.form.id, json!([{"field_id":enabled,"op":op,"value":false}]))
            .await
            .json()
            .await
            .expect("boolean filter");
        assert_eq!(page.total, total, "False is a value, not empty ({op})");
    }
    for (field, op, value) in [
        (multi.id, "any_of", json!([])),
        (multi.id, "none_of", json!([alpha.id, alpha.id])),
        (multi.id, "any_of", json!(["not-a-uuid"])),
        (multi.id, "any_of", json!(alpha.id)),
        (multi.id, "eq", json!([alpha.id])),
        (multi.id, "any_of", json!(vec![Uuid::new_v4(); 101])),
        (duration.id, "any_of", json!([alpha.id])),
        (attachment.id, "ne", json!(alpha.id)),
    ] {
        assert_eq!(
            api.filtered(work.form.id, json!([{"field_id":field,"op":op,"value":value}]))
                .await
                .status(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "Reject malformed/incompatible {op}"
        );
    }
    let view: View=api.ok(Method::POST,&format!("/api/v1/forms/{}/views",work.form.id),json!({"name":"Relation filter choices","config":{"columns":[],"sort":null,"filters":[{"field_id":multi.id,"op":"none_of","value":[alpha.id,beta.id]}]}})).await;
    assert_eq!(
        serde_json::to_value(&view.config.filters).expect("saved filters")[0]["value"],
        json!([alpha.id, beta.id])
    );
    // Ratings are bounded integer values; presentation settings persist independently of record data.
    let rating: Field = api.ok(Method::POST, &format!("/api/v1/forms/{}/fields", work.form.id), json!({"name":"Rating","key":"rating","type":"integer","config":{"rating":{"max":10,"icon":"star","color":"ochre"}}})).await;
    let rated: Record = api
        .ok(
            Method::POST,
            &format!("/api/v1/forms/{}/records", work.form.id),
            json!({"values":{name.to_string():"Rated",rating.id.to_string():8}}),
        )
        .await;
    assert_eq!(rated.values[&rating.id], json!(8));
    for value in [json!(-1), json!(11), json!(1.5), json!("8")] {
        assert_eq!(
            api.request(
                Method::POST,
                &format!("/api/v1/forms/{}/records", work.form.id),
                json!({"values":{name.to_string():"Bad rating",rating.id.to_string():value}})
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    assert_eq!(
        api.request(
            Method::PATCH,
            &format!("/api/v1/fields/{}", rating.id),
            json!({"config":{"rating":{"max":5,"icon":"heart","color":"red"}}})
        )
        .await
        .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let restyled: Field = api
        .ok(
            Method::PATCH,
            &format!("/api/v1/fields/{}", rating.id),
            json!({"config":{"rating":{"max":10,"icon":"heart","color":"red"}}}),
        )
        .await;
    assert_eq!(restyled.config.rating.unwrap().icon, RatingIcon::Heart);
    let amount: Field = api.ok(Method::POST,&format!("/api/v1/forms/{}/fields",work.form.id),json!({"name":"Amount","key":"amount","type":"decimal","config":{"number_format":"currency","currency":"USD","decimal_places":2}})).await;
    let money: Record = api
        .ok(
            Method::POST,
            &format!("/api/v1/forms/{}/records", work.form.id),
            json!({"values":{name.to_string():"Exact amount",amount.id.to_string():"9007199254740993.25"}}),
        )
        .await;
    assert_eq!(money.values[&amount.id], json!("9007199254740993.25"));
    let percent: Field = api
        .ok(
            Method::PATCH,
            &format!("/api/v1/fields/{}", amount.id),
            json!({"config":{"number_format":"percent","decimal_places":1}}),
        )
        .await;
    assert_eq!(percent.config.number_format, Some(NumberFormat::Percent));
    assert_eq!(
        api.request(
            Method::PATCH,
            &format!("/api/v1/fields/{}", relation.id),
            json!({"config":{"cardinality":"many"}})
        )
        .await
        .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let _ = std::fs::remove_dir_all(storage);
}
#[sqlx::test(migrations = "../persistence/migrations")]
async fn batch_record_writes(pool: PgPool) {
    let (_server, api, login, password, storage) = start(&pool).await;
    let tasks = api.form("tasks", "standard").await;
    let people = api.form("people", "standard").await;
    let form = tasks.form.id;
    let name = tasks.fields[0].id;
    let person_name = people.fields[0].id;
    let owner = api
        .field(
            form,
            "owner",
            "relation",
            json!({"target_form_id":people.form.id,"cardinality":"one","presentation":"record_picker"}),
        )
        .await;
    let ada = api.create(people.form.id, json!({person_name.to_string():"Ada"})).await;
    api.create(people.form.id, json!({person_name.to_string():"Sam"})).await;
    api.create(people.form.id, json!({person_name.to_string():"Sam"})).await;
    let a = api.create(form, json!({name.to_string():"A"})).await;
    let b = api.create(form, json!({name.to_string():"B"})).await;
    let batch = format!("/api/v1/forms/{form}/records/batch");
    let total = |page: RecordPage| page.total;
    let count = || async {
        total(
            api.ok(Method::GET, &format!("/api/v1/forms/{form}/records"), Value::Null)
                .await,
        )
    };
    let version = |id: Uuid| {
        let api = &api;
        async move {
            let record: Record = api.ok(Method::GET, &format!("/api/v1/records/{id}"), Value::Null).await;
            record.version
        }
    };

    // One invalid record rejects the whole batch, including valid updates and creates.
    let response = api
        .request(
            Method::POST,
            &batch,
            json!({"updates":[
                {"record_id":a.id,"expected_version":a.version,"values":{name.to_string():"A2"}},
                {"record_id":b.id,"expected_version":b.version,"values":{name.to_string():null}}
            ],"creates":[{"values":{name.to_string():"C"}}]}),
        )
        .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let error: ApiError = response.json().await.expect("error contract");
    assert!(
        error
            .records
            .iter()
            .all(|r| r.record_id == Some(b.id) && r.field_id == Some(name))
    );
    assert!(!error.records.is_empty());
    assert_eq!(
        (version(a.id).await, version(b.id).await, count().await),
        (a.version, b.version, 2)
    );

    // A relation target from another form is caught during the write and still rolls everything back.
    let response = api
        .request(
            Method::POST,
            &batch,
            json!({"updates":[{"record_id":a.id,"expected_version":a.version,"values":{name.to_string():"A2"}}],
                   "creates":[{"values":{name.to_string():"C",owner.id.to_string():[b.id]}}]}),
        )
        .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let error: ApiError = response.json().await.expect("error contract");
    assert_eq!(error.records[0].create_index, Some(0));
    assert_eq!((version(a.id).await, count().await), (a.version, 2));

    // A stale version anywhere refuses the batch and reports the changed record.
    let response = api
        .request(
            Method::POST,
            &batch,
            json!({"updates":[
                {"record_id":a.id,"expected_version":a.version,"values":{name.to_string():"A2"}},
                {"record_id":b.id,"expected_version":b.version - 1,"values":{name.to_string():"B2"}}
            ]}),
        )
        .await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let error: ApiError = response.json().await.expect("error contract");
    assert_eq!(
        error.records.iter().map(|r| r.record_id).collect::<Vec<_>>(),
        vec![Some(b.id)]
    );
    assert_eq!(error.current.map(|r| r.id), Some(b.id));
    assert_eq!(version(a.id).await, a.version);

    // Duplicate records, empty batches, and batches over the limit are refused before any work.
    for body in [
        json!({"updates":[
            {"record_id":a.id,"expected_version":a.version,"values":{}},
            {"record_id":a.id,"expected_version":a.version,"values":{}}
        ]}),
        json!({}),
        json!({"creates":vec![json!({"values":{name.to_string():"x"}}); MAX_BATCH_RECORDS + 1]}),
    ] {
        assert_eq!(
            api.request(Method::POST, &batch, body).await.status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    assert_eq!(count().await, 2);

    // A valid batch updates and creates together; creates append after existing manual order.
    let written: WrittenRecords = api
        .ok(
            Method::POST,
            &batch,
            json!({"updates":[
                {"record_id":a.id,"expected_version":a.version,"values":{name.to_string():"A2",owner.id.to_string():[ada.id]}},
                {"record_id":b.id,"expected_version":b.version,"values":{name.to_string():"B2"}}
            ],"creates":[{"values":{name.to_string():"C"}},{"values":{name.to_string():"D"}}]}),
        )
        .await;
    assert_eq!(
        written.updated.iter().map(|r| (r.id, r.version)).collect::<Vec<_>>(),
        vec![(a.id, a.version + 1), (b.id, b.version + 1)]
    );
    assert_eq!(written.updated[0].values[&owner.id], json!([ada.id]));
    let page: RecordPage = api
        .ok(Method::GET, &format!("/api/v1/forms/{form}/records"), Value::Null)
        .await;
    let names: Vec<_> = page.records.iter().map(|r| r.values[&name].clone()).collect();
    assert_eq!(names, vec![json!("A2"), json!("B2"), json!("C"), json!("D")]);

    // Labels resolve by exact primary name: unique, missing, ambiguous, and case-sensitive.
    let resolved: Vec<ResolvedLabel> = api
        .ok(
            Method::POST,
            &format!("/api/v1/forms/{}/records/resolve", people.form.id),
            json!({"labels":["Ada","Nobody","Sam","ada"]}),
        )
        .await;
    assert_eq!(
        resolved
            .iter()
            .map(|r| (r.label.as_str(), r.record_id, r.matches))
            .collect::<Vec<_>>(),
        vec![
            ("Ada", Some(ada.id), 1),
            ("Nobody", None, 0),
            ("Sam", None, 2),
            ("ada", None, 0)
        ]
    );

    // Archiving and restoring, as undo uses them: versioned, atomic with other writes, and data-preserving.
    let (c, d) = (&written.created[0], &written.created[1]);
    let response = api
        .request(
            Method::POST,
            &batch,
            json!({"archives":[{"record_id":c.id,"expected_version":c.version}],
                   "updates":[{"record_id":d.id,"expected_version":d.version,"values":{name.to_string():null}}]}),
        )
        .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(count().await, 4);
    let archived: WrittenRecords = api
        .ok(
            Method::POST,
            &batch,
            json!({"archives":[{"record_id":c.id,"expected_version":c.version}]}),
        )
        .await;
    assert_eq!(
        (archived.archived[0].id, archived.archived[0].version),
        (c.id, c.version + 1)
    );
    assert_eq!(count().await, 3);
    let stale = api
        .request(
            Method::POST,
            &batch,
            json!({"restores":[{"record_id":c.id,"expected_version":c.version}]}),
        )
        .await;
    assert_eq!(stale.status(), StatusCode::CONFLICT);
    let live = api
        .request(
            Method::POST,
            &batch,
            json!({"restores":[{"record_id":d.id,"expected_version":d.version}]}),
        )
        .await;
    assert_eq!(live.status(), StatusCode::NOT_FOUND);
    let restored: WrittenRecords = api
        .ok(
            Method::POST,
            &batch,
            json!({"restores":[{"record_id":c.id,"expected_version":c.version + 1}]}),
        )
        .await;
    assert_eq!(restored.restored[0].version, c.version + 2);
    assert_eq!(restored.restored[0].values[&name], json!("C"));
    assert_eq!(count().await, 4);
    // A record that an active record links to stays, unless the linking record is archived in the same write.
    let people_batch = format!("/api/v1/forms/{}/records/batch", people.form.id);
    let ada_now = version(ada.id).await;
    let response = api
        .request(
            Method::POST,
            &people_batch,
            json!({"archives":[{"record_id":ada.id,"expected_version":ada_now}]}),
        )
        .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let a_now = version(a.id).await;
    api.ok::<WrittenRecords>(
        Method::POST,
        &batch,
        json!({"updates":[{"record_id":a.id,"expected_version":a_now,"values":{owner.id.to_string():[]}}]}),
    )
    .await;
    let freed: WrittenRecords = api
        .ok(
            Method::POST,
            &people_batch,
            json!({"archives":[{"record_id":ada.id,"expected_version":ada_now}]}),
        )
        .await;
    assert_eq!(freed.archived.len(), 1);

    // Another workspace can neither write these records nor resolve labels in this workspace's forms.
    let other = second_workspace(&pool, &api, &login, &password).await;
    let theirs = other.form("theirs", "standard").await;
    assert_eq!(
        other
            .request(
                Method::POST,
                &batch,
                json!({"creates":[{"values":{name.to_string():"intruder"}}]})
            )
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        other
            .request(
                Method::POST,
                &format!("/api/v1/forms/{}/records/batch", theirs.form.id),
                json!({"updates":[{"record_id":a.id,"expected_version":a.version + 1,"values":{}}]})
            )
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        other
            .request(
                Method::POST,
                &format!("/api/v1/forms/{}/records/resolve", people.form.id),
                json!({"labels":["Ada"]})
            )
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    let _ = std::fs::remove_dir_all(storage);
}
