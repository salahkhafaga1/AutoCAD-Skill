#!/usr/bin/env python3
"""Local keyword search over P0.2 page indexes (P0.3). Stdlib only.

Reads P0.1 manifests and P0.2 `pages.jsonl` indexes. Never opens PDF
files. Prints excerpts as evidence with method/confidence labels;
interpretation stays the agent's job. No matches prints an explicit
no-match statement — never a confabulated answer.

Usage:
    python tools/ref_search.py --lib global=<root> [--lib project=<root>]
        --query "door clearance" [--ref ID] [--global-only | --project-only]
        [--context 0|1] [--limit 10] [--json]
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

VERSION = "0.3.0"
SCHEMA_VERSION = 1
EXCERPT_CHARS = 500

WORD_RE = re.compile(r"\w+", re.UNICODE)
HEADING_RE = re.compile(r"^\s*(?:\d+(?:\.\d+)*\.?\s+\S.{0,100}|[A-Z][A-Z0-9 .,'&()/-]{3,80})$")


def tokenize(text: str) -> list[str]:
    return WORD_RE.findall(text.casefold())


def heuristic_section(text: str) -> str | None:
    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) > 120:
            continue
        if HEADING_RE.match(line) and not line.isdigit():
            if line.isupper() and len(line.split()) < 2:
                continue
            return line[:120]
    return None


def excerpt_around(text: str, terms: list[str], width: int = EXCERPT_CHARS) -> str:
    lowered = text.casefold()
    positions = [lowered.find(t) for t in terms if t in lowered]
    if not positions:
        snippet = text[:width]
    else:
        center = min(positions)
        start = max(0, center - width // 3)
        snippet = text[start:start + width]
        if start > 0:
            snippet = "…" + snippet[1:].lstrip()
    snippet = " ".join(snippet.split())
    if len(text) > len(snippet) + 10:
        snippet = snippet.rstrip() + "…"
    return snippet


def load_library(name: str, root: Path) -> tuple[dict, list[str]]:
    """Return (manifest entries, warnings). Never raises for missing files."""
    warnings: list[str] = []
    manifest_path = root / "references.json"
    if not manifest_path.is_file():
        return [], [f"[{name}] no references.json — library not configured"]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        return [], [f"[{name}] invalid manifest: {type(exc).__name__}: {exc}"]
    entries = manifest.get("references", [])
    if not isinstance(entries, list):
        return [], [f"[{name}] invalid manifest: references is not an array"]
    return entries, warnings


def load_index(root: Path, ref_id: str) -> tuple[list[dict] | None, str | None]:
    pages_path = root / ".index" / ref_id / "pages.jsonl"
    if not pages_path.is_file():
        return None, "index-missing"
    try:
        pages = [json.loads(line) for line in
                 pages_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    except (OSError, ValueError) as exc:
        return None, f"index-unreadable: {type(exc).__name__}"
    return pages, None


def score_pages(pages: list[dict], terms: list[str]) -> list[tuple[float, dict]]:
    """Token-AND with per-reference tf * log rarity. Explainable on purpose."""
    n = len(pages)
    if not n or not terms:
        return []
    df: dict[str, int] = {t: 0 for t in terms}
    page_terms: list[tuple[dict, dict[str, int]]] = []
    for page in pages:
        counts: dict[str, int] = {}
        for token in tokenize(page.get("text", "")):
            if token in df and token not in counts:
                counts[token] = 0
            if token in df:
                counts[token] += 1
        for token in counts:
            df[token] += 1
        page_terms.append((page, counts))
    scored = []
    for page, counts in page_terms:
        if any(t not in counts for t in terms):
            continue
        score = sum(counts[t] * math.log(1 + n / max(df[t], 1)) for t in terms)
        scored.append((score, page))
    scored.sort(key=lambda item: (-item[0], str(item[1].get("ref_id", "")),
                                   int(item[1].get("page", 0))))
    return scored


def build_hit(ref_id: str, scope: str, page: dict, score: float) -> dict:
    section = page.get("section")
    section_source = "index" if section else None
    if not section:
        section = heuristic_section(page.get("text", ""))
        section_source = "heuristic" if section else None
    return {"ref_id": ref_id, "scope": scope,
            "page": page.get("page"), "folio": page.get("folio"),
            "section": section, "section_source": section_source,
            "method": page.get("method", "unknown"),
            "confidence": page.get("confidence", "unverified"),
            "review_status": page.get("review_status", "unreviewed"),
            "flags": page.get("flags", []),
            "score": round(score, 4)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Local keyword search over reference page indexes.")
    ap.add_argument("--lib", action="append", default=[],
                    help="scope=root, repeatable (e.g. --lib global=C:/refs)")
    ap.add_argument("--query", required=True)
    ap.add_argument("--ref", default=None, help="restrict to one reference id")
    ap.add_argument("--global-only", action="store_true")
    ap.add_argument("--project-only", action="store_true")
    ap.add_argument("--context", type=int, choices=(0, 1), default=0)
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--json", action="store_true", dest="as_json")
    args = ap.parse_args(argv)

    if args.limit < 1:
        print("--limit must be >= 1", file=sys.stderr)
        return 2
    terms = tokenize(args.query)
    if not terms:
        print("empty query: no searchable terms", file=sys.stderr)
        return 2

    libraries: list[tuple[str, Path]] = []
    for spec in args.lib:
        if "=" not in spec:
            print(f"--lib must be scope=path, got: {spec}", file=sys.stderr)
            return 2
        name, _, root = spec.partition("=")
        libraries.append((name.strip(), Path(root)))
    if args.global_only:
        libraries = [(n, r) for n, r in libraries if n == "global"]
    if args.project_only:
        libraries = [(n, r) for n, r in libraries if n == "project"]
    if not libraries:
        print("no libraries selected (pass --lib scope=path)", file=sys.stderr)
        return 2

    # Duplicate ids across scopes without an explicit --ref are refused.
    id_scopes: dict[str, set[str]] = {}
    manifests: dict[str, list] = {}
    warnings: list[str] = []
    for name, root in libraries:
        entries, warns = load_library(name, root)
        warnings.extend(warns)
        manifests[name] = entries
        for entry in entries:
            if isinstance(entry, dict) and entry.get("id"):
                id_scopes.setdefault(entry["id"], set()).add(name)
    refused = {rid for rid, scopes in id_scopes.items()
               if len(scopes) > 1 and args.ref != rid}
    if refused:
        warnings.append("duplicate id(s) not searched (pick one with --ref): "
                        + ", ".join(f'"{r}"' for r in sorted(refused)))
    if args.ref and args.ref not in id_scopes:
        print(f"unknown ref-id: {args.ref}", file=sys.stderr)
        return 2

    hits: list[dict] = []
    consulted: list[str] = []
    for name, root in libraries:
        for entry in manifests[name]:
            if not isinstance(entry, dict) or not entry.get("id"):
                continue
            ref_id = entry["id"]
            if args.ref and ref_id != args.ref:
                continue
            if ref_id in refused:
                continue
            pages, problem = load_index(root, ref_id)
            consulted.append(f"{name}/{ref_id}")
            if pages is None:
                warnings.append(f"[{name}/{ref_id}] {problem} — skipped")
                continue
            by_page = {p.get("page"): p for p in pages if isinstance(p, dict)}
            for score, page in score_pages(pages, terms)[:args.limit * 3]:
                hit = build_hit(ref_id, name, page, score)
                if args.context:
                    for delta in (-1, 1):
                        neighbor = by_page.get(int(page.get("page", 0)) + delta)
                        if isinstance(neighbor, dict) and neighbor.get("text"):
                            hit.setdefault("context", []).append({
                                "page": neighbor.get("page"),
                                "excerpt": excerpt_around(neighbor["text"], terms)})
                hit["excerpt"] = excerpt_around(page.get("text", ""), terms)
                hits.append(hit)
    hits.sort(key=lambda h: (h["scope"] != "project", -h["score"],
                             h["ref_id"], h["page"] or 0))
    hits = hits[:args.limit]

    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)

    if args.as_json:
        print(json.dumps({"schema": SCHEMA_VERSION, "query": args.query,
                          "terms": terms, "consulted": consulted,
                          "warnings": warnings, "hits": hits},
                         ensure_ascii=False, indent=1))
        return 0

    if not hits:
        print(f"no reliable match for terms {terms}")
        print(f"consulted: {', '.join(consulted) if consulted else '(no indexes available)'}")
        return 0
    for hit in hits:
        print(f"[{hit['scope']}/{hit['ref_id']}] p.{hit['page']} "
              f"(folio {hit['folio']}) [{hit['method']}/{hit['confidence']}]")
        if hit["section"]:
            print(f"  section ({hit['section_source']}): {hit['section']}")
        if hit["flags"]:
            print(f"  flags: {', '.join(hit['flags'])}")
        print(f"  {hit['excerpt']}")
        for ctx in hit.get("context", []):
            print(f"  context p.{ctx['page']}: {ctx['excerpt']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
