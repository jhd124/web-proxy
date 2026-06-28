use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{extract::State, Json};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use parking_lot::RwLock;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const LICENSE_PREFIX: &str = "proxy-license-v1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Plan {
    Trial,
    Pro,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanLimits {
    pub breakpoints: Option<u32>,
    pub overrides: Option<u32>,
    pub saved_requests: Option<u32>,
}

impl PlanLimits {
    pub fn trial() -> Self {
        Self {
            breakpoints: Some(1),
            overrides: Some(1),
            saved_requests: Some(1),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LicensedFeature {
    Breakpoints,
    Overrides,
    SavedRequests,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BillingUsage {
    pub breakpoints: u32,
    pub overrides: u32,
    pub saved_requests: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BillingStatus {
    pub plan: Plan,
    pub activated: bool,
    pub license_id: Option<String>,
    pub limits: PlanLimits,
    pub usage: BillingUsage,
    pub expires_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub license_id: String,
    pub plan: Plan,
    pub limits: PlanLimits,
    pub issued_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub customer_email: Option<String>,
    pub device_limit: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateLicenseBody {
    pub license_key: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorBody {
    pub code: String,
    pub message: String,
    pub feature: Option<LicensedFeature>,
    pub limit: Option<u32>,
    pub used: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct ApiError {
    status: StatusCode,
    body: ApiErrorBody,
}

impl ApiError {
    pub fn quota_exceeded(feature: LicensedFeature, limit: u32, used: u32) -> Self {
        Self {
            status: StatusCode::PAYMENT_REQUIRED,
            body: ApiErrorBody {
                code: "quotaExceeded".to_string(),
                message: "Trial quota exceeded".to_string(),
                feature: Some(feature),
                limit: Some(limit),
                used: Some(used),
            },
        }
    }

    pub fn invalid_license(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            body: ApiErrorBody {
                code: "invalidLicense".to_string(),
                message: message.into(),
                feature: None,
                limit: None,
                used: None,
            },
        }
    }

    pub fn status(&self) -> StatusCode {
        self.status
    }
}

impl From<StatusCode> for ApiError {
    fn from(status: StatusCode) -> Self {
        Self {
            status,
            body: ApiErrorBody {
                code: "httpError".to_string(),
                message: status
                    .canonical_reason()
                    .unwrap_or("request failed")
                    .to_string(),
                feature: None,
                limit: None,
                used: None,
            },
        }
    }
}

impl PartialEq<StatusCode> for ApiError {
    fn eq(&self, other: &StatusCode) -> bool {
        self.status == *other
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

#[derive(Debug)]
pub struct BillingState {
    db_path: PathBuf,
    license: RwLock<Option<VerifiedLicense>>,
    public_key: RwLock<Option<VerifyingKey>>,
    load_error: RwLock<Option<String>>,
}

#[derive(Clone, Debug)]
struct VerifiedLicense {
    payload: LicensePayload,
}

impl BillingState {
    pub fn init(db_path: &Path) -> anyhow::Result<Self> {
        ensure_schema(db_path)?;
        let public_key = public_key_from_env();
        let state = Self {
            db_path: db_path.to_path_buf(),
            license: RwLock::new(None),
            public_key: RwLock::new(public_key),
            load_error: RwLock::new(None),
        };
        state.load_stored_license();
        Ok(state)
    }

    pub fn trial_only(db_path: PathBuf, error: String) -> Self {
        Self {
            db_path,
            license: RwLock::new(None),
            public_key: RwLock::new(None),
            load_error: RwLock::new(Some(error)),
        }
    }

    pub fn status(&self, usage: BillingUsage) -> BillingStatus {
        let verified = self.current_valid_license();
        if let Some(license) = verified {
            return BillingStatus {
                plan: license.payload.plan,
                activated: true,
                license_id: Some(license.payload.license_id),
                limits: license.payload.limits,
                usage,
                expires_at: license.payload.expires_at,
                error: None,
            };
        }
        BillingStatus {
            plan: Plan::Trial,
            activated: false,
            license_id: None,
            limits: PlanLimits::trial(),
            usage,
            expires_at: None,
            error: self.load_error.read().clone(),
        }
    }

    pub fn activate(&self, license_key: &str) -> Result<LicensePayload, ApiError> {
        let verified = self.verify_license_key(license_key)?;
        save_license_key(&self.db_path, license_key)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        *self.license.write() = Some(verified.clone());
        *self.load_error.write() = None;
        Ok(verified.payload)
    }

    pub fn ensure_quota(
        &self,
        feature: LicensedFeature,
        used: u32,
        adding_new_item: bool,
    ) -> Result<(), ApiError> {
        if !adding_new_item {
            return Ok(());
        }
        let limits = self
            .current_valid_license()
            .map(|license| license.payload.limits)
            .unwrap_or_else(PlanLimits::trial);
        let limit = match feature {
            LicensedFeature::Breakpoints => limits.breakpoints,
            LicensedFeature::Overrides => limits.overrides,
            LicensedFeature::SavedRequests => limits.saved_requests,
        };
        if let Some(limit) = limit {
            if used >= limit {
                return Err(ApiError::quota_exceeded(feature, limit, used));
            }
        }
        Ok(())
    }

    fn current_valid_license(&self) -> Option<VerifiedLicense> {
        let verified = self.license.read().clone()?;
        if let Some(expires_at) = verified.payload.expires_at {
            if expires_at <= Utc::now() {
                return None;
            }
        }
        Some(verified)
    }

    fn load_stored_license(&self) {
        match load_license_key(&self.db_path) {
            Ok(Some(key)) => match self.verify_license_key(&key) {
                Ok(verified) => {
                    *self.license.write() = Some(verified);
                }
                Err(error) => {
                    *self.load_error.write() = Some(error.body.message);
                }
            },
            Ok(None) => {}
            Err(error) => {
                *self.load_error.write() = Some(error.to_string());
            }
        }
    }

    fn verify_license_key(&self, license_key: &str) -> Result<VerifiedLicense, ApiError> {
        let public_key = self
            .public_key
            .read()
            .as_ref()
            .copied()
            .ok_or_else(|| ApiError::invalid_license("License public key is not configured"))?;
        let parts: Vec<&str> = license_key.trim().split('.').collect();
        if parts.len() != 3 || parts[0] != LICENSE_PREFIX {
            return Err(ApiError::invalid_license("License key format is invalid"));
        }
        let payload_base64 = parts[1];
        let signature_bytes = URL_SAFE_NO_PAD
            .decode(parts[2])
            .map_err(|_| ApiError::invalid_license("License signature is invalid"))?;
        let signature = Signature::from_slice(&signature_bytes)
            .map_err(|_| ApiError::invalid_license("License signature is invalid"))?;
        public_key
            .verify(payload_base64.as_bytes(), &signature)
            .map_err(|_| ApiError::invalid_license("License signature is invalid"))?;
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(payload_base64)
            .map_err(|_| ApiError::invalid_license("License payload is invalid"))?;
        let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
            .map_err(|_| ApiError::invalid_license("License payload is invalid"))?;
        if let Some(expires_at) = payload.expires_at {
            if expires_at <= Utc::now() {
                return Err(ApiError::invalid_license("License has expired"));
            }
        }
        Ok(VerifiedLicense { payload })
    }

    #[cfg(test)]
    pub fn set_public_key_base64_for_tests(&self, value: &str) {
        *self.public_key.write() = parse_public_key(value).ok();
    }

    #[cfg(test)]
    pub fn activate_pro_for_tests(&self) {
        *self.license.write() = Some(VerifiedLicense {
            payload: LicensePayload {
                license_id: "test-license".to_string(),
                plan: Plan::Pro,
                limits: PlanLimits {
                    breakpoints: None,
                    overrides: None,
                    saved_requests: None,
                },
                issued_at: Utc::now(),
                expires_at: None,
                customer_email: None,
                device_limit: None,
            },
        });
    }
}

pub fn usage_from_state(state: &crate::state::AppState) -> BillingUsage {
    BillingUsage {
        breakpoints: state.breakpoints.read().len() as u32,
        overrides: state.overrides.read().len() as u32,
        saved_requests: crate::saved_requests::count_saved_requests(&state.override_db_path)
            .unwrap_or_default(),
    }
}

pub async fn get_status(State(state): State<Arc<crate::state::AppState>>) -> Json<BillingStatus> {
    Json(state.billing.status(usage_from_state(&state)))
}

pub async fn activate_license(
    State(state): State<Arc<crate::state::AppState>>,
    Json(body): Json<ActivateLicenseBody>,
) -> Result<Json<BillingStatus>, ApiError> {
    state.billing.activate(&body.license_key)?;
    Ok(Json(state.billing.status(usage_from_state(&state))))
}

fn ensure_schema(db_path: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS billing_license (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            license_key TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )
}

fn save_license_key(db_path: &Path, license_key: &str) -> rusqlite::Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        r#"
        INSERT INTO billing_license (id, license_key, updated_at)
        VALUES (1, ?1, ?2)
        ON CONFLICT(id) DO UPDATE SET
            license_key = excluded.license_key,
            updated_at = excluded.updated_at
        "#,
        params![license_key, Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

fn load_license_key(db_path: &Path) -> rusqlite::Result<Option<String>> {
    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare("SELECT license_key FROM billing_license WHERE id = 1")?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

fn public_key_from_env() -> Option<VerifyingKey> {
    std::env::var("LICENSE_PUBLIC_KEY")
        .ok()
        .and_then(|value| parse_public_key(&value).ok())
}

fn parse_public_key(value: &str) -> anyhow::Result<VerifyingKey> {
    let bytes = URL_SAFE_NO_PAD.decode(value.trim())?;
    let public_key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("LICENSE_PUBLIC_KEY must decode to 32 bytes"))?;
    Ok(VerifyingKey::from_bytes(&public_key_bytes)?)
}
