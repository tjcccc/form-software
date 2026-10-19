use crate::{AppState, config::Config, error::*};
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum::{
    Extension, Json,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use form_domain::*;
use form_persistence::{Actor, Store};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{Duration, Instant},
};
use uuid::Uuid;

pub fn hash_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}
pub async fn initialize(store: &Store, config: &Config) -> Result<Actor, Box<dyn std::error::Error>> {
    let existing = sqlx::query("SELECT u.id AS user_id,m.workspace_id FROM users u JOIN workspace_memberships m ON m.user_id=u.id WHERE u.username=$1")
        .bind(&config.username).fetch_optional(&store.pool).await?;
    if let Some(row) = existing {
        return Ok(Actor {
            user_id: row.try_get("user_id")?,
            workspace_id: row.try_get("workspace_id")?,
        });
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&store.pool)
        .await?;
    if count > 0 {
        return Err("An owner already exists. FORM_USERNAME must match the provisioned owner.".into());
    }
    let password = config
        .password
        .clone()
        .ok_or("FORM_PASSWORD is required to provision the first owner")?;
    if password.len() < 12 {
        return Err("FORM_PASSWORD must be at least 12 characters".into());
    }
    let hash = tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
            .map(|h| h.to_string())
            .map_err(|e| e.to_string())
    })
    .await??;
    let actor = Actor {
        user_id: Uuid::new_v4(),
        workspace_id: Uuid::new_v4(),
    };
    let mut tx = store.pool.begin().await?;
    sqlx::query("INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)")
        .bind(actor.user_id)
        .bind(&config.username)
        .bind(hash)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO workspaces(id,slug,name) VALUES($1,'personal','Personal workspace')")
        .bind(actor.workspace_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')")
        .bind(actor.workspace_id)
        .bind(actor.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(actor)
}
fn cookie(token: &str, secure: bool, age: i32) -> String {
    format!(
        "formsw_session={token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age={age}{}",
        if secure { "; Secure" } else { "" }
    )
}
fn token(headers: &HeaderMap) -> Option<(String, bool)> {
    if let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|s| s.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
    {
        return Some((value.into(), false));
    }
    headers
        .get(header::COOKIE)
        .and_then(|s| s.to_str().ok())
        .and_then(|s| {
            s.split(';')
                .find_map(|part| part.trim().strip_prefix("formsw_session="))
        })
        .map(|s| (s.into(), true))
}
pub async fn protect(State(state): State<Arc<AppState>>, mut request: Request, next: Next) -> HttpResult<Response> {
    let (token, is_cookie) = token(request.headers()).ok_or_else(unauthorized)?;
    if is_cookie
        && !matches!(*request.method(), axum::http::Method::GET | axum::http::Method::HEAD)
        && request.headers().get(header::ORIGIN).and_then(|h| h.to_str().ok()) != Some(&state.config.origin)
    {
        return Err(HttpError::new(
            StatusCode::FORBIDDEN,
            "origin",
            "Request origin is not allowed.",
        ));
    }
    let row=sqlx::query("SELECT s.user_id,s.workspace_id FROM sessions s JOIN workspace_memberships m ON m.user_id=s.user_id AND m.workspace_id=s.workspace_id WHERE token_hash=$1 AND expires_at>now()")
        .bind(hash_token(&token)).fetch_optional(&state.store.pool).await?.ok_or_else(unauthorized)?;
    request.extensions_mut().insert(Actor {
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
    });
    Ok(next.run(request).await)
}
fn unauthorized() -> HttpError {
    HttpError::new(StatusCode::UNAUTHORIZED, "unauthorized", "Sign in to continue.")
}
fn throttle(state: &AppState, ip: IpAddr) -> HttpResult<()> {
    let mut attempts = state
        .login_attempts
        .lock()
        .map_err(|_| HttpError::internal("login throttle lock"))?;
    let now = Instant::now();
    attempts.retain(|_, times| {
        times.retain(|t| now.duration_since(*t) < Duration::from_secs(900));
        !times.is_empty()
    });
    if attempts.len() > 10_000 {
        return Err(HttpError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limit",
            "Please try again later.",
        ));
    }
    let times = attempts.entry(ip).or_default();
    if times.len() >= 8 {
        return Err(HttpError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limit",
            "Too many sign-in attempts. Try again in 15 minutes.",
        ));
    }
    times.push(now);
    Ok(())
}
#[utoipa::path(post,path="/api/v1/auth/login",request_body=Login,responses((status=200,body=LoginResult),(status=401,body=ApiError)))]
pub async fn login(
    State(state): State<Arc<AppState>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ApiJson(input): ApiJson<Login>,
) -> HttpResult<Response> {
    if headers
        .get(header::ORIGIN)
        .is_some_and(|h| h.to_str().ok() != Some(&state.config.origin))
    {
        return Err(HttpError::new(
            StatusCode::FORBIDDEN,
            "origin",
            "Request origin is not allowed.",
        ));
    }
    throttle(&state, peer.ip())?;
    if input.username.len() > 100 || input.password.len() > 1024 {
        return Err(unauthorized());
    }
    let row=sqlx::query("SELECT u.id,u.password_hash,m.workspace_id FROM users u JOIN workspace_memberships m ON m.user_id=u.id WHERE u.username=$1").bind(input.username).fetch_optional(&state.store.pool).await?;
    let hash: String = match &row {
        Some(row) => row.try_get("password_hash")?,
        None => state.dummy_hash.clone(),
    };
    let valid = tokio::task::spawn_blocking(move || {
        PasswordHash::new(&hash).is_ok_and(|h| Argon2::default().verify_password(input.password.as_bytes(), &h).is_ok())
    })
    .await
    .map_err(HttpError::internal)?;
    let row = row.filter(|_| valid).ok_or_else(unauthorized)?;
    let actor = Actor {
        user_id: row.try_get("id")?,
        workspace_id: row.try_get("workspace_id")?,
    };
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    sqlx::query("DELETE FROM sessions WHERE expires_at<now()")
        .execute(&state.store.pool)
        .await?;
    sqlx::query(
        "INSERT INTO sessions(token_hash,user_id,workspace_id,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",
    )
    .bind(hash_token(&token))
    .bind(actor.user_id)
    .bind(actor.workspace_id)
    .execute(&state.store.pool)
    .await?;
    let result = LoginResult {
        token: token.clone(),
        session: state.store.session_info(actor).await?,
    };
    Ok((
        [(
            header::SET_COOKIE,
            cookie(&token, state.config.secure_cookie, 2_592_000),
        )],
        Json(result),
    )
        .into_response())
}
#[utoipa::path(delete,path="/api/v1/auth/session",responses((status=204)))]
pub async fn logout(State(state): State<Arc<AppState>>, headers: HeaderMap) -> HttpResult<Response> {
    if let Some((token, _)) = token(&headers) {
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(hash_token(&token))
            .execute(&state.store.pool)
            .await?;
    }
    Ok((
        StatusCode::NO_CONTENT,
        [(header::SET_COOKIE, cookie("", state.config.secure_cookie, 0))],
    )
        .into_response())
}
#[utoipa::path(get,path="/api/v1/workspaces/current",responses((status=200,body=SessionInfo)))]
pub async fn session(
    State(state): State<Arc<AppState>>,
    Extension(actor): Extension<Actor>,
) -> HttpResult<Json<SessionInfo>> {
    Ok(Json(state.store.session_info(actor).await?))
}
