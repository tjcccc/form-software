mod attachments;
mod auth;
mod config;
mod contract;
mod error;
mod imports;
mod routes;
use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, header},
    middleware,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use config::Config;
use form_persistence::Store;
use sqlx::postgres::PgPoolOptions;
use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, Mutex},
    time::Instant,
};
use tower_http::{
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use utoipa::OpenApi;

pub struct AppState {
    store: Store,
    config: Config,
    dummy_hash: String,
    login_attempts: Mutex<HashMap<IpAddr, Vec<Instant>>>,
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().any(|arg| arg == "--openapi") {
        println!("{}", contract::ApiDoc::openapi().to_pretty_json()?);
        return Ok(());
    }
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "form_server=info,tower_http=info".into()),
        )
        .init();
    let config = Config::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(12)
        .connect(&config.database_url)
        .await?;
    let store = Store::new(pool);
    store.migrate().await?;
    let actor = auth::initialize(&store, &config).await?;
    if config.seed_demo {
        form_persistence::seed_demo(&store, actor).await?;
    }
    tokio::fs::create_dir_all(&config.storage).await?;
    use argon2::{
        Argon2, PasswordHasher,
        password_hash::{SaltString, rand_core::OsRng},
    };
    let dummy_hash = Argon2::default()
        .hash_password(b"unusable dummy credential", &SaltString::generate(&mut OsRng))
        .map_err(|e| e.to_string())?
        .to_string();
    let bind = config.bind;
    let state = Arc::new(AppState {
        store,
        config,
        dummy_hash,
        login_attempts: Mutex::new(HashMap::new()),
    });
    let protected = Router::new()
        .route("/workspaces/current", get(auth::session))
        .route("/auth/session", delete(auth::logout))
        .route("/forms", get(routes::forms).post(routes::create_form))
        .route("/forms/{id}", patch(routes::update_form))
        .route("/forms/{id}/schema", get(routes::schema))
        .route("/forms/{id}/fields", post(routes::create_field))
        .route("/fields/{id}", patch(routes::update_field))
        .route("/forms/{id}/records", get(routes::records).post(routes::create_record))
        .route("/forms/{id}/records/batch", post(routes::write_records))
        .route("/forms/{id}/records/resolve", post(routes::resolve_records))
        .route(
            "/records/{id}",
            get(routes::record)
                .patch(routes::update_record)
                .delete(routes::archive_record),
        )
        .route("/forms/{id}/views", get(routes::views).post(routes::save_view))
        .route(
            "/views/{view_id}/columns/{field_id}/width",
            patch(routes::update_column_width),
        )
        .route("/fields/{id}/duplicate", post(attachments::duplicate_field))
        .route("/records/{id}/insert", post(routes::insert_record))
        .route("/records/{id}/duplicate", post(attachments::duplicate))
        .route("/records/{id}/attachments", post(attachments::upload))
        .route(
            "/attachments/{id}",
            get(attachments::download).delete(attachments::remove),
        )
        .route("/imports/csv/preview", post(imports::preview))
        .route("/imports/csv/commit", post(imports::commit))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth::protect));
    let api = Router::new()
        .route("/auth/login", post(auth::login))
        .merge(protected)
        .fallback(|| async {
            error::HttpError::new(axum::http::StatusCode::NOT_FOUND, "not_found", "Unknown API route.").into_response()
        })
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ));
    let app=Router::new().nest("/api/v1",api)
        .route("/health",get(||async{"ok"}))
        .route("/api/openapi.json",get(||async{axum::Json(contract::ApiDoc::openapi())}))
        .fallback_service(ServeDir::new("web/dist").not_found_service(ServeFile::new("web/dist/index.html")))
        .layer(DefaultBodyLimit::max(12*1024*1024))
        .layer(SetResponseHeaderLayer::if_not_present(header::X_CONTENT_TYPE_OPTIONS,HeaderValue::from_static("nosniff")))
        .layer(SetResponseHeaderLayer::if_not_present(header::REFERRER_POLICY,HeaderValue::from_static("same-origin")))
        .layer(SetResponseHeaderLayer::if_not_present(header::CONTENT_SECURITY_POLICY,HeaderValue::from_static("default-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")))
        .layer(TraceLayer::new_for_http()).with_state(state);
    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind,"FormSoftware API ready");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await?;
    Ok(())
}
async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    {
        let terminate = async {
            if let Ok(mut signal) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
                signal.recv().await;
            }
        };
        tokio::select! {_ = ctrl_c=>{},_ = terminate=>{}};
    }
    #[cfg(not(unix))]
    ctrl_c.await;
}
