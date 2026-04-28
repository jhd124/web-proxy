#!/usr/bin/env python3
"""
Read-only: likely-unused CSS module classes and *texts.ts* leaf keys.

  python3 unused_report.py css-modules [ROOT]
  python3 unused_report.py texts [ROOT]
  python3 unused_report.py all [ROOT]

Default ROOT: current working directory.
Skips: node_modules, dist, build, .git, coverage, .next, target, hidden dirs.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterator

SRC_EXT = {".ts", ".tsx", ".js", ".jsx", ".vue"}
MOD = ".module.css"
SKIP = frozenset(
    {
        "node_modules",
        "dist",
        "build",
        ".git",
        "coverage",
        ".next",
        "target",
    }
)
TEXTS_NAME = "texts.ts"
KEY_LEN_MIN = 3


def _walk_files(root: Path) -> Iterator[Path]:
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(x in p.parts for x in SKIP) or p.name.startswith("."):
            continue
        yield p


def _by_ext(root: Path, exts: set[str]) -> Iterator[Path]:
    for p in _walk_files(root):
        if p.suffix.lower() in exts:
            yield p


def _strip_ts_comments(s: str) -> str:
    s = re.sub(r"//[^\n]*", "", s)
    return re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)


def _strip_css_comments(s: str) -> str:
    return re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)


def _composes_deps(css: str) -> set[str]:
    out: set[str] = set()
    for m in re.finditer(
        r"composes\s*:\s*([^;{}\n]+?)(?:;|$)", css, flags=re.IGNORECASE | re.MULTILINE
    ):
        chunk = m.group(1).split("from", 1)[0]
        for raw in chunk.split(","):
            w = re.sub(
                r"^\.+",
                "",
                raw.strip().split()[0] if raw.split() else "",
            )
            if w and (w[0].isalpha() or w[0] == "_"):
                out.add(w)
    return out


def _strip_css_global_selectors(css: str) -> str:
    """Remove :global(...) so .foo inside is not treated as a local module class."""
    return re.sub(r":global\s*\([^)]*\)", " ", css, flags=re.IGNORECASE)


def _class_names_defined(css: str) -> set[str]:
    t = _strip_css_global_selectors(_strip_css_comments(css))
    names: set[str] = set()
    for m in re.finditer(
        r"[^.\w#-]\.([a-zA-Z_][\w-]*)(?=\s*[,{:#.\s>+~*[\]().]|$)",
        t,
    ):
        names.add(m.group(1))
    for m in re.finditer(
        r"^\.([a-zA-Z_][\w-]*)(?=\s*[,{:#.\s>+~*[\]().])",
        t,
        re.MULTILINE,
    ):
        names.add(m.group(1))
    return names


def _importers_of(root: Path, mpath: Path) -> list[Path]:
    n = mpath.name
    out: list[Path] = []
    for f in _by_ext(root, SRC_EXT):
        if f.resolve() == mpath.resolve():
            continue
        try:
            txt = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if n not in txt or "import" not in txt:
            continue
        if re.search(
            r"from\s+['\"]([^'\"]*)" + re.escape(n) + r"['\"]", txt
        ):
            out.append(f)
    return out


def _default_import_binding(t: str, file_name: str) -> str | None:
    for m in re.finditer(
        r"import\s+(\w+)\s+from\s+['\"]([^'\"]+)['\"]",
        t,
    ):
        if m.group(2).rstrip().endswith(file_name):
            return m.group(1)
    return None


def _binding_uses_class(src: str, b: str, c: str) -> bool:
    return bool(
        re.search(
            r"\b" + re.escape(b) + r"\s*\.\s*" + re.escape(c) + r"\b",
            src,
        )
    )


def cmd_css_modules(root: Path) -> int:
    found: list[tuple[str, str, list[Path] | list[str]]] = []
    for p in _by_ext(root, {".css"}):
        if not p.name.endswith(MOD):
            continue
        try:
            css = p.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            print(f"  skip {p}: {e}", file=sys.stderr)
            continue
        cdeps = _composes_deps(css)
        clss = _class_names_defined(css)
        if not clss and not cdeps:
            continue
        im = _importers_of(root, p)
        for cls in sorted(clss):
            if cls in cdeps:
                continue
            if not im:
                found.append((str(p), cls, ["(no importers)"]))
                continue
            any_use = False
            for f in im:
                txt = f.read_text(encoding="utf-8", errors="replace")
                b = _default_import_binding(txt, p.name)
                if b and _binding_uses_class(txt, b, cls):
                    any_use = True
                    break
            if not any_use:
                found.append((str(p), cls, im))
    if not found:
        print("No unused (unreferenced) CSS module classes detected.")
        return 0
    print(
        "CSS .module: class not used as <importName>.<className> "
        "in a file that imports that sheet\n"
    )
    for pth, cls, im in found:
        if im == ["(no importers)"]:
            im_s = "(no importers)"
        else:
            im_s = "importers: " + ", ".join(str(x) for x in im)
        print(f"  {pth}\n    .{cls}\n    {im_s}\n")
    return 0


def _skip_ws(s: str, i: int) -> int:
    n = len(s)
    while i < n and s[i] in " \t\n\r":
        i += 1
    return i


def _scan_value(s: str, i: int) -> int:
    """From first char of a property value to the `,` or `}` that ends the property."""
    n = len(s)
    j = i
    b = p = r = 0
    tq: str | None = None
    while j < n:
        c = s[j]
        if tq is not None:
            if tq in "'\"":
                if c == "\\" and j + 1 < n:
                    j += 2
                    continue
                if c == tq:
                    tq = None
                j += 1
                continue
            if tq == "`":
                if c == "\\" and j + 1 < n:
                    j += 2
                    continue
                if c == "$" and j + 1 < n and s[j + 1] == "{":
                    d = 1
                    j += 2
                    while j < n and d:
                        ch = s[j]
                        if ch == "{":
                            d += 1
                        elif ch == "}":
                            d -= 1
                        j += 1
                    continue
                if c == "`":
                    tq = None
                j += 1
                continue
        if c in "'\"`":
            tq = c
            j += 1
            continue
        if c == "{":
            b += 1
        elif c == "}":
            if b > 0:
                b -= 1
            elif p == 0 and r == 0:
                return j
        elif c == "(":
            p += 1
        elif c == ")":
            if p > 0:
                p -= 1
        elif c == "[":
            r += 1
        elif c == "]":
            if r > 0:
                r -= 1
        elif c == "," and b == 0 and p == 0 and r == 0:
            return j
        j += 1
    return n


def _parse_leaves(
    s: str, i: int, path: list[str]
) -> tuple[int, list[tuple[str, str]]]:
    assert s[i] == "{"
    o: list[tuple[str, str]] = []
    n = len(s)
    j = i + 1
    while j < n:
        j = _skip_ws(s, j)
        if j >= n:
            break
        if s[j] == "}":
            return j + 1, o
        m = re.match(r"([a-zA-Z_][\w]*)\s*:\s*", s[j:])
        if not m:
            j += 1
            continue
        key = m.group(1)
        nxt = j + m.end()
        nxt = _skip_ws(s, nxt)
        if nxt >= n:
            break
        if s[nxt] == "{":
            e, sub = _parse_leaves(s, nxt, path + [key])
            o.extend(sub)
            j = e
        else:
            e = _scan_value(s, nxt)
            o.append((".".join(path + [key]), key))
            j = e
        if j < n and s[j] == ",":
            j += 1
    return n, o


def _export_leaves_from_texts(
    path: Path,
) -> tuple[str | None, list[tuple[str, str]]]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    t = _strip_ts_comments(raw)
    m = re.search(r"export\s+const\s+(\w+)\s*=\s*(\{)", t)
    if not m:
        return None, []
    _, l = _parse_leaves(t, m.start(2), [])
    return m.group(1), l


def _all_src_content(root: Path) -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    for f in _by_ext(root, {".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"}):
        try:
            out.append((f, f.read_text(encoding="utf-8", errors="replace")))
        except OSError:
            continue
    return out


def _key_in_bodies(key: str, bodies: list[str]) -> bool:
    pat = re.compile(rf"\.{re.escape(key)}\b")
    for b in bodies:
        if pat.search(b):
            return True
    return False


def cmd_texts(root: Path) -> int:
    res: list[tuple[str, str, str]] = []
    all_src = _all_src_content(root)
    for p, _ in all_src:
        if p.name != TEXTS_NAME:
            continue
        ex, leaves = _export_leaves_from_texts(p)
        if not ex:
            print(f"  (skip parse) {p}", file=sys.stderr)
            continue
        skip = p.resolve()
        bodies = [c for fp, c in all_src if fp.resolve() != skip]
        for dotted, key in leaves:
            if len(key) < KEY_LEN_MIN:
                continue
            if not _key_in_bodies(key, bodies):
                res.append((str(p), f"{ex}.{dotted}", key))
    if not res:
        print("No likely-unused *texts.ts* leaf keys detected (heuristic).")
        return 0
    print(
        f"*texts.ts* leaves: no `.{{key}}` in other source files (min key len {KEY_LEN_MIN}; heuristic)\n"
    )
    for path, full, k in res:
        print(f"  {path}\n    {full}  (key: {k})\n")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    s = p.add_subparsers(dest="cmd", required=True)
    s1 = s.add_parser("css-modules", help="CSS .module: classes not used via import.foo")
    s1.add_argument("root", nargs="?", type=Path, default=Path.cwd())
    s2 = s.add_parser("texts", help="texts.ts: leaf key names not in .key elsewhere (heuristic)")
    s2.add_argument("root", nargs="?", type=Path, default=Path.cwd())
    s3 = s.add_parser("all", help="Run css-modules then texts")
    s3.add_argument("root", nargs="?", type=Path, default=Path.cwd())
    a = p.parse_args()
    r_ = a.root.resolve()
    if not r_.is_dir():
        print("Not a directory", file=sys.stderr)
        raise SystemExit(1)
    if a.cmd == "css-modules":
        raise SystemExit(cmd_css_modules(r_))
    if a.cmd == "texts":
        raise SystemExit(cmd_texts(r_))
    if a.cmd == "all":
        print("== css-modules ==")
        cmd_css_modules(r_)
        print("== texts ==")
        raise SystemExit(cmd_texts(r_))
    raise SystemExit(0)
