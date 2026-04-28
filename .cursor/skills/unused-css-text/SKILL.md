---
name: unused-css-text
description: >-
  Reports likely-unused CSS module classes and unused *texts.ts* leaf keys via a
  read-only Python script (no deps). Use when removing dead styles or copy,
  auditing the frontend after refactors, or when the user asks to find unused CSS
  or unused i18n/text keys.
---

# Unused CSS and text keys

## What it does

The script **never edits files**. It prints findings for you to verify and delete by hand (or in a follow-up edit).

| Subcommand | Detects |
|------------|---------|
| `css-modules` | In each `*.module.css`, class names that are **not** used as `importName.className` in any file that imports that sheet. Skips names that only appear as composition bases (`composes: foo`). Strips `:global(...)` so globals like `:global(.primary)` are not mistaken for local classes. |
| `texts` | In each `**/texts.ts`, **leaf** keys of the `export const … = { … } as const` object whose names never appear as **`.key`** in any other source file (same heuristic as manual grep). Keys shorter than 3 characters are skipped (noise). |
| `all` | Runs `css-modules` then `texts`. |

**Out of scope (v1):** non-default CSS imports (`import * as x`), side-effect-only imports, global classes from `App.css`, JSX text nodes without `t.key`, and dynamic property access.

## Run

From the repo:

```bash
python3 .cursor/skills/unused-css-text/scripts/unused_report.py all frontend
```

Or a single mode / custom root:

```bash
python3 .cursor/skills/unused-css-text/scripts/unused_report.py css-modules frontend
python3 .cursor/skills/unused-css-text/scripts/unused_report.py texts .
```

Default `ROOT` is the current working directory if omitted.

## After the report

- **CSS:** Remove unused rules or wire them up; if a class is only used via `composes`, it should not be listed.
- **Text:** remove the key from `texts.ts` only after confirming no `t.key` / `tf.key` / destructuring use; watch for duplicate short names across features (heuristic false positives).

## Limits

- `texts` mode uses a small parser for nested `const` objects; odd syntax may be mis-parsed (see stderr `(skip parse)`).
- Duplicate key names in different text bundles can hide a truly unused key (rare).
