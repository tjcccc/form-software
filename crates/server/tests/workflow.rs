//! One focused HTTP integration scenario against a fresh SQLx-managed disposable database.
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
    async fn ok<T: serde::de::DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Value,
    ) -> T {
        let response = self.request(method, path, body).await;
        let status = response.status();
        let value: Value = response.json().await.expect("JSON response");
        assert!(status.is_success(), "{path}: {status} {value}");
        serde_json::from_value(value).expect("response contract")
    }
    async fn form(&self, key: &str, kind: &str) -> FormSchema {
        self.ok(
            Method::POST,
            "/api/v1/forms",
            json!({"key":key,"name":key,"kind":kind}),
        )
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
    async fn create(&self, form: Uuid, values: Value) -> Record {
        self.ok(
            Method::POST,
            &format!("/api/v1/forms/{form}/records"),
            json!({"values":values}),
        )
        .await
    }
}
#[sqlx::test(migrations = "../persistence/migrations")]
async fn authenticated_record_workflow(pool: PgPool) {
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
    let _server = Server(
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
        client: client.clone(),
        base: base.clone(),
        token: login.token,
    };
    let work = api.form("work", "standard").await;
    let options = api.form("types", "options").await;
    let projects = api.form("projects", "standard").await;
    let name = work.fields[0].id;
    let duration = api
        .field(work.form.id, "duration", "duration", json!({}))
        .await;
    let relation = api
        .field(
            work.form.id,
            "type",
            "relation",
            json!({"target_form_id":options.form.id,"cardinality":"one","presentation":"select"}),
        )
        .await;
    let attachment = api
        .field(work.form.id, "files", "attachment", json!({}))
        .await;
    let enabled = options
        .fields
        .iter()
        .find(|f| f.key == "enabled")
        .expect("enabled")
        .id;
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
    let record=api.create(work.form.id,json!({name.to_string():"First entry",duration.id.to_string():60,relation.id.to_string():[option.id]})).await;
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
            .request(
                Method::PATCH,
                &path,
                json!({"expected_version":1,"values":values}),
            )
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
    let part =
        reqwest::multipart::Part::bytes(b"integration attachment".to_vec()).file_name("notes.txt");
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
    assert_eq!(
        download.bytes().await.expect("bytes"),
        "integration attachment"
    );
    assert_eq!(
        client
            .get(format!("{base}/api/v1/attachments/{}", file.id))
            .send()
            .await
            .expect("private download")
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let mapping =
        json!([{"column":"Name","field_id":name},{"column":"Minutes","field_id":duration.id}]);
    let bad_import =
        json!({"form_id":work.form.id,"csv":"Name,Minutes\nGood,20\nBad,-5\n","mapping":mapping});
    let preview: ImportPreview = api
        .ok(
            Method::POST,
            "/api/v1/imports/csv/preview",
            bad_import.clone(),
        )
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
    // A second workspace must not read, mutate, or reference the first workspace's resources.
    let other_user = Uuid::new_v4();
    let other_workspace = Uuid::new_v4();
    sqlx::query("INSERT INTO users(id,username,password_hash) SELECT $1,'other',password_hash FROM users WHERE id=$2").bind(other_user).bind(login.session.user.id).execute(&pool).await.expect("other user");
    sqlx::query("INSERT INTO workspaces(id,slug,name) VALUES($1,'other','Other')")
        .bind(other_workspace)
        .execute(&pool)
        .await
        .expect("other workspace");
    sqlx::query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",
    )
    .bind(other_workspace)
    .bind(other_user)
    .execute(&pool)
    .await
    .expect("membership");
    let other: LoginResult = client
        .post(format!("{base}/api/v1/auth/login"))
        .json(&json!({"username":"other","password":password}))
        .send()
        .await
        .expect("other login")
        .json()
        .await
        .expect("other login contract");
    let other = Api {
        client,
        base,
        token: other.token,
    };
    assert_eq!(
        other
            .request(Method::GET, &path, Value::Null)
            .await
            .status(),
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
            .request(
                Method::GET,
                &format!("/api/v1/attachments/{}", file.id),
                Value::Null
            )
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
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
    let _ = std::fs::remove_dir_all(storage);
}
