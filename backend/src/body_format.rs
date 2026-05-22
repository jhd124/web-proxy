use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions, IndentChar};
use oxc_minifier::{Minifier, MinifierOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatBodyRequest {
    pub body: String,
    pub kind: FormatBodyKind,
    pub mode: FormatBodyMode,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FormatBodyKind {
    Json,
    Javascript,
    Html,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FormatBodyMode {
    Beautify,
    Uglify,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatBodyResponse {
    pub body: String,
}

pub async fn format_body(Json(req): Json<FormatBodyRequest>) -> impl IntoResponse {
    match format_override_body(&req.body, req.kind, req.mode) {
        Ok(body) => (StatusCode::OK, Json(FormatBodyResponse { body })).into_response(),
        Err(message) => (StatusCode::BAD_REQUEST, message).into_response(),
    }
}

fn format_override_body(
    body: &str,
    kind: FormatBodyKind,
    mode: FormatBodyMode,
) -> Result<String, String> {
    match (kind, mode) {
        (FormatBodyKind::Json, FormatBodyMode::Beautify) => beautify_json(body),
        (FormatBodyKind::Json, FormatBodyMode::Uglify) => uglify_json(body),
        (FormatBodyKind::Javascript, FormatBodyMode::Beautify) => format_javascript(body, false),
        (FormatBodyKind::Javascript, FormatBodyMode::Uglify) => format_javascript(body, true),
        (FormatBodyKind::Html, FormatBodyMode::Beautify) => Ok(beautify_html(body)),
        (FormatBodyKind::Html, FormatBodyMode::Uglify) => uglify_html(body),
    }
}

fn beautify_json(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&value)
        .map(|s| format!("{s}\n"))
        .map_err(|e| e.to_string())
}

fn uglify_json(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
    serde_json::to_string(&value).map_err(|e| e.to_string())
}

fn format_javascript(body: &str, minify: bool) -> Result<String, String> {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, body, SourceType::unambiguous()).parse();
    if let Some(error) = parsed.errors.first() {
        return Err(format!("{error:?}"));
    }

    let mut program = parsed.program;
    if minify {
        let minifier = Minifier::new(MinifierOptions::default());
        let result = minifier.minify(&allocator, &mut program);
        return Ok(Codegen::new()
            .with_options(CodegenOptions::minify())
            .with_scoping(result.scoping)
            .with_private_member_mappings(result.class_private_mappings)
            .build(&program)
            .code);
    }

    Ok(Codegen::new()
        .with_options(CodegenOptions {
            indent_char: IndentChar::Space,
            indent_width: 2,
            ..CodegenOptions::default()
        })
        .build(&program)
        .code)
}

fn beautify_html(body: &str) -> String {
    let mut out = String::new();
    let mut indent = 0usize;

    for token in tokenize_html(body) {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            continue;
        }

        if is_html_close_tag(trimmed) {
            indent = indent.saturating_sub(1);
        }

        out.push_str(&"  ".repeat(indent));
        out.push_str(trimmed);
        out.push('\n');

        if is_html_open_tag(trimmed) {
            indent += 1;
        }
    }

    out
}

fn uglify_html(body: &str) -> Result<String, String> {
    let comments = Regex::new(r"(?s)<!--.*?-->").map_err(|e| e.to_string())?;
    let between_tags = Regex::new(r">\s+<").map_err(|e| e.to_string())?;
    let multi_space = Regex::new(r"\s{2,}").map_err(|e| e.to_string())?;
    let without_comments = comments.replace_all(body, "");
    let compact_tags = between_tags.replace_all(&without_comments, "><");
    Ok(multi_space
        .replace_all(&compact_tags, " ")
        .trim()
        .to_string())
}

fn tokenize_html(body: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut rest = body;

    while let Some(start) = rest.find('<') {
        let text = &rest[..start];
        if !text.trim().is_empty() {
            tokens.push(text.to_string());
        }

        let tag_and_after = &rest[start..];
        if let Some(end) = tag_and_after.find('>') {
            tokens.push(tag_and_after[..=end].to_string());
            rest = &tag_and_after[end + 1..];
        } else {
            tokens.push(tag_and_after.to_string());
            rest = "";
        }
    }

    if !rest.trim().is_empty() {
        tokens.push(rest.to_string());
    }

    tokens
}

fn is_html_close_tag(token: &str) -> bool {
    token.starts_with("</")
}

fn is_html_open_tag(token: &str) -> bool {
    if !token.starts_with('<')
        || token.starts_with("</")
        || token.starts_with("<!")
        || token.starts_with("<?")
        || token.ends_with("/>")
    {
        return false;
    }

    let name = token
        .trim_start_matches('<')
        .split(|c: char| c.is_whitespace() || c == '>' || c == '/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();

    !matches!(
        name.as_str(),
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_json() {
        let formatted = format_override_body(
            r#"{"name":"proxy"}"#,
            FormatBodyKind::Json,
            FormatBodyMode::Beautify,
        )
        .unwrap();
        assert_eq!(formatted, "{\n  \"name\": \"proxy\"\n}\n");
    }

    #[test]
    fn formats_javascript() {
        let formatted = format_override_body(
            "const value={name:'proxy'};",
            FormatBodyKind::Javascript,
            FormatBodyMode::Beautify,
        )
        .unwrap();
        assert!(formatted.contains("const value = {"));
    }

    #[test]
    fn minifies_html() {
        let formatted = format_override_body(
            "<div>\n  <!-- note -->\n  <span>hi</span>\n</div>",
            FormatBodyKind::Html,
            FormatBodyMode::Uglify,
        )
        .unwrap();
        assert_eq!(formatted, "<div><span>hi</span></div>");
    }
}
