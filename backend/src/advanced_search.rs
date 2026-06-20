use crate::saved_requests;
use crate::state::{AppState, BreakpointRule, OverrideRule, SavedRequest, TrafficEntry};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const MAX_MATCHES_PER_GROUP: usize = 4_000;
const SNIPPET_RADIUS: usize = 72;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchQuery {
    #[serde(default)]
    pub q: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchResponse {
    pub query: String,
    pub groups: Vec<AdvancedSearchGroup>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchGroup {
    pub entity_type: AdvancedSearchEntityType,
    pub label: &'static str,
    pub matches: Vec<AdvancedSearchMatch>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AdvancedSearchEntityType {
    Traffic,
    Override,
    Breakpoint,
    Saved,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSearchMatch {
    pub entity_type: AdvancedSearchEntityType,
    pub id: String,
    pub title: String,
    pub field: String,
    pub snippet: String,
}

pub async fn search(
    Query(query): Query<AdvancedSearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<AdvancedSearchResponse>, StatusCode> {
    let normalized_query = query.q.trim().to_string();
    let keywords = parse_keywords(&normalized_query);
    if keywords.is_empty() {
        return Ok(Json(empty_response(normalized_query)));
    }

    let traffic = state.traffic.read().clone();
    let overrides = state.overrides.read().clone();
    let breakpoints = state.breakpoints.read().clone();
    let saved = saved_requests::load_all(&state.override_db_path)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let traffic_matches = search_traffic(&traffic, &keywords);
    let override_matches = search_overrides(&overrides, &keywords);
    let breakpoint_matches = search_breakpoints(&breakpoints, &keywords);
    let saved_matches = search_saved(&saved, &keywords);
    let total = traffic_matches.len()
        + override_matches.len()
        + breakpoint_matches.len()
        + saved_matches.len();

    Ok(Json(AdvancedSearchResponse {
        query: normalized_query,
        total,
        groups: vec![
            AdvancedSearchGroup {
                entity_type: AdvancedSearchEntityType::Traffic,
                label: "traffic",
                matches: traffic_matches,
            },
            AdvancedSearchGroup {
                entity_type: AdvancedSearchEntityType::Override,
                label: "override",
                matches: override_matches,
            },
            AdvancedSearchGroup {
                entity_type: AdvancedSearchEntityType::Breakpoint,
                label: "breakpoint",
                matches: breakpoint_matches,
            },
            AdvancedSearchGroup {
                entity_type: AdvancedSearchEntityType::Saved,
                label: "saved",
                matches: saved_matches,
            },
        ],
    }))
}

fn empty_response(query: String) -> AdvancedSearchResponse {
    AdvancedSearchResponse {
        query,
        total: 0,
        groups: vec![
            empty_group(AdvancedSearchEntityType::Traffic, "traffic"),
            empty_group(AdvancedSearchEntityType::Override, "override"),
            empty_group(AdvancedSearchEntityType::Breakpoint, "breakpoint"),
            empty_group(AdvancedSearchEntityType::Saved, "saved"),
        ],
    }
}

fn empty_group(entity_type: AdvancedSearchEntityType, label: &'static str) -> AdvancedSearchGroup {
    AdvancedSearchGroup {
        entity_type,
        label,
        matches: Vec::new(),
    }
}

fn parse_keywords(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(str::trim)
        .filter(|keyword| !keyword.is_empty())
        .map(|keyword| keyword.to_ascii_lowercase())
        .collect()
}

fn search_traffic(entries: &[TrafficEntry], keywords: &[String]) -> Vec<AdvancedSearchMatch> {
    let mut matches = Vec::new();
    for entry in entries.iter().rev() {
        let title = traffic_title(entry);
        push_match(
            &mut matches,
            AdvancedSearchEntityType::Traffic,
            entry.id.to_string(),
            title.clone(),
            "url",
            &entry.url,
            keywords,
        );
        push_match(
            &mut matches,
            AdvancedSearchEntityType::Traffic,
            entry.id.to_string(),
            title.clone(),
            "request headers",
            &headers_to_text(&entry.request_headers),
            keywords,
        );
        if let Some(body) = entry.request_body_preview.as_deref() {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Traffic,
                entry.id.to_string(),
                title.clone(),
                "request body",
                body,
                keywords,
            );
        }
        if let Some(headers) = entry.response_headers.as_deref() {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Traffic,
                entry.id.to_string(),
                title.clone(),
                "response headers",
                &headers_to_text(headers),
                keywords,
            );
        }
        if let Some(body) = entry.response_body_preview.as_deref() {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Traffic,
                entry.id.to_string(),
                title.clone(),
                "response body",
                body,
                keywords,
            );
        }
        if let Some(error) = entry.error.as_deref() {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Traffic,
                entry.id.to_string(),
                title,
                "error",
                error,
                keywords,
            );
        }
        if matches.len() >= MAX_MATCHES_PER_GROUP {
            break;
        }
    }
    matches
}

fn search_overrides(rules: &[OverrideRule], keywords: &[String]) -> Vec<AdvancedSearchMatch> {
    let mut matches = Vec::new();
    for rule in rules {
        let title = override_title(rule);
        for (field, value) in override_search_fields(rule) {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Override,
                rule.id.clone(),
                title.clone(),
                field,
                &value,
                keywords,
            );
            if matches.len() >= MAX_MATCHES_PER_GROUP {
                return matches;
            }
        }
    }
    matches
}

fn search_breakpoints(rules: &[BreakpointRule], keywords: &[String]) -> Vec<AdvancedSearchMatch> {
    let mut matches = Vec::new();
    for rule in rules {
        let title = rule.name.clone();
        for (field, value) in breakpoint_search_fields(rule) {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Breakpoint,
                rule.id.to_string(),
                title.clone(),
                field,
                &value,
                keywords,
            );
            if matches.len() >= MAX_MATCHES_PER_GROUP {
                return matches;
            }
        }
    }
    matches
}

fn search_saved(requests: &[SavedRequest], keywords: &[String]) -> Vec<AdvancedSearchMatch> {
    let mut matches = Vec::new();
    for request in requests {
        let entry = &request.entry;
        let title = traffic_title(entry);
        push_match(
            &mut matches,
            AdvancedSearchEntityType::Saved,
            request.id.to_string(),
            title.clone(),
            "url",
            &entry.url,
            keywords,
        );
        push_match(
            &mut matches,
            AdvancedSearchEntityType::Saved,
            request.id.to_string(),
            title.clone(),
            "request headers",
            &headers_to_text(&entry.request_headers),
            keywords,
        );
        if let Some(body) = entry.request_body_preview.as_deref() {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Saved,
                request.id.to_string(),
                title.clone(),
                "request body",
                body,
                keywords,
            );
        }
        if let Some(headers) = entry.response_headers.as_deref() {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Saved,
                request.id.to_string(),
                title.clone(),
                "response headers",
                &headers_to_text(headers),
                keywords,
            );
        }
        if let Some(body) = entry.response_body_preview.as_deref() {
            push_match(
                &mut matches,
                AdvancedSearchEntityType::Saved,
                request.id.to_string(),
                title,
                "response body",
                body,
                keywords,
            );
        }
        if matches.len() >= MAX_MATCHES_PER_GROUP {
            break;
        }
    }
    matches
}

fn push_match(
    matches: &mut Vec<AdvancedSearchMatch>,
    entity_type: AdvancedSearchEntityType,
    id: String,
    title: String,
    field: &str,
    value: &str,
    keywords: &[String],
) {
    if matches.len() >= MAX_MATCHES_PER_GROUP {
        return;
    }
    let Some(snippet) = build_snippet(value, keywords) else {
        return;
    };
    matches.push(AdvancedSearchMatch {
        entity_type,
        id,
        title,
        field: field.to_string(),
        snippet,
    });
}

fn build_snippet(value: &str, keywords: &[String]) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized_value = trimmed.to_ascii_lowercase();
    let match_index = keywords
        .iter()
        .filter_map(|keyword| normalized_value.find(keyword))
        .min()?;
    let snippet_start = previous_char_boundary(trimmed, match_index.saturating_sub(SNIPPET_RADIUS));
    let snippet_end =
        next_char_boundary(trimmed, (match_index + SNIPPET_RADIUS).min(trimmed.len()));
    let prefix = if snippet_start > 0 { "..." } else { "" };
    let suffix = if snippet_end < trimmed.len() {
        "..."
    } else {
        ""
    };
    Some(format!(
        "{prefix}{}{suffix}",
        compact_whitespace(&trimmed[snippet_start..snippet_end])
    ))
}

fn previous_char_boundary(value: &str, mut index: usize) -> usize {
    while index > 0 && !value.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn next_char_boundary(value: &str, mut index: usize) -> usize {
    while index < value.len() && !value.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn compact_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn headers_to_text(headers: &[(String, String)]) -> String {
    headers
        .iter()
        .map(|(name, value)| format!("{name}: {value}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn traffic_title(entry: &TrafficEntry) -> String {
    format!("{} {}", entry.method, entry.url)
}

fn override_title(rule: &OverrideRule) -> String {
    let method = rule.match_method.as_deref().unwrap_or("*");
    let host = rule.match_host.as_deref().unwrap_or("*");
    let path = rule.match_path.as_deref().unwrap_or("*");
    format!("{method} {host}{path}")
}

fn override_search_fields(rule: &OverrideRule) -> Vec<(&'static str, String)> {
    vec![
        (
            "match method",
            rule.match_method.clone().unwrap_or_default(),
        ),
        (
            "match protocol",
            rule.match_protocol.clone().unwrap_or_default(),
        ),
        ("match host", rule.match_host.clone().unwrap_or_default()),
        ("match path", rule.match_path.clone().unwrap_or_default()),
        (
            "match headers",
            headers_to_text(&rule.match_request_headers),
        ),
        ("match query", headers_to_text(&rule.match_query)),
        (
            "match body",
            rule.match_request_body.clone().unwrap_or_default(),
        ),
        ("response status", rule.status.to_string()),
        ("response headers", headers_to_text(&rule.headers)),
        ("response body", rule.body.clone()),
        (
            "map remote protocol",
            rule.map_remote_protocol.clone().unwrap_or_default(),
        ),
        (
            "map remote host",
            rule.map_remote_host.clone().unwrap_or_default(),
        ),
        (
            "map remote path",
            rule.map_remote_path.clone().unwrap_or_default(),
        ),
    ]
}

fn breakpoint_search_fields(rule: &BreakpointRule) -> Vec<(&'static str, String)> {
    vec![
        ("name", rule.name.clone()),
        (
            "match method",
            rule.match_method.clone().unwrap_or_default(),
        ),
        (
            "match origin",
            rule.match_origin.clone().unwrap_or_default(),
        ),
        (
            "match path",
            rule.match_path_regex.clone().unwrap_or_default(),
        ),
    ]
}
