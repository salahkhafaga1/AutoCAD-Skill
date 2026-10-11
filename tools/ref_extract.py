#!/usr/bin/env python3
"""Tier-1 per-page PDF text extraction (P0.2). Requires pypdf (optional).

Reads each registered PDF through the P0.1 manifest, extracts per-page
text with page numbers, classifies pages (text/image/mixed/empty/failed/
skipped), and writes `doc.json` + `pages.jsonl` under <out>/<ref-id>/.

Performs NO OCR: image pages are classified with empty text, never
transcribed. Writes nothing except under --out. Never moves or modifies
registered files.

Usage:
    python tools/ref_extract.py --manifest refs.json --lib-root <dir> --out <dir>
    python tools/ref_extract.py --manifest refs.json --lib-root <dir> --out <dir> --ref-id one-id
    (tests only) ... --password <pw> to exercise the encrypted branch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

VERSION = "0.1.0"
EXTRACTOR_NAME = "ref_extract"
TEXT_MIN_CHARS = 50
SETTINGS = {"text_min_chars": TEXT_MIN_CHARS, "extract_mode": "plain"}

OCR_PRODUCER_MARKERS = ("paper capture", "omnipage", "scansoft", "abbyy",
                        "tesseract", "ocrmypdf", "acrobat")
OCR_CREATOR_MARKERS = ("scan plug-in", "scanner", "omnipage", "paper capture")


def need_pypdf():
    try:
        import pypdf  # noqa: F401
        from pypdf import PdfReader  # noqa: F401
    except ImportError:
        print("pdf-lib-unavailable: install the approved pypdf pin into "
              ".venv-ref first; nothing was changed.", file=sys.stderr)
        raise SystemExit(3)
    import pypdf
    return pypdf


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_resolve(lib_root: Path, rel: str) -> tuple[Path | None, bool, str | None]:
    """Return (resolved, external, refusal). Canonicalizes symlinks; refuses
    anything escaping the root (relative) — absolute paths are external."""
    if os.path.isabs(rel):
        return Path(os.path.normpath(rel)), True, None
    abs_path = Path(os.path.realpath(lib_root / rel))
    root_real = Path(os.path.realpath(lib_root))
    try:
        abs_path.relative_to(root_real)
    except ValueError:
        return abs_path, False, "unsafe-path: escapes the library root"
    return abs_path, False, None


def font_tounicode_status(fonts) -> tuple[int, int, bool]:
    """Return (font count, fonts carrying /ToUnicode, subset_without_map).

    Accepts pypdf font mappings or plain dicts (tests use the latter).
    Presence only — never decodes. A subset font (BaseFont with a '+' tag)
    lacking /ToUnicode is the genuinely suspect case; Base-14 standard
    fonts without maps extract reliably and are not flagged.
    """
    if not fonts:
        return 0, 0, False
    try:
        items = list(fonts.values())
    except AttributeError:
        return 0, 0, False
    total = len(items)
    with_map = 0
    suspect = False
    for font in items:
        try:
            target = font.get_object() if hasattr(font, "get_object") else font
            if not isinstance(target, dict):
                continue
            if "/ToUnicode" in target:
                with_map += 1
            else:
                base = str(target.get("/BaseFont", ""))
                if "+" in base:
                    suspect = True
        except Exception:
            continue
    return total, with_map, suspect


def page_image_count(page) -> int:
    try:
        return len(page.images)
    except Exception:
        pass
    try:
        xobjects = page["/Resources"].get("/XObject", {})
        target = xobjects.get_object() if hasattr(xobjects, "get_object") else xobjects
        return sum(1 for _ in (target or {}))
    except Exception:
        return 0


def outline_sections(reader) -> dict[int, str]:
    """Map 0-based page indices to bookmark section titles. Best effort:
    returns {} when outlines are absent or unreadable. Never raises."""
    sections: dict[int, str] = {}

    def walk(items, trail: list[str]) -> None:
        last: str | None = None
        for item in items or []:
            if isinstance(item, list):
                walk(item, trail + ([last] if last else []))
                continue
            try:
                title = str(item.title).strip()
            except Exception:
                continue
            if not title:
                continue
            last = title
            try:
                number = reader.get_destination_page_number(item)
            except Exception:
                continue
            if isinstance(number, int) and number >= 0:
                sections[number] = " / ".join(trail + [title])

    try:
        walk(reader.outline, [])
    except Exception:
        return {}
    return sections


def detect_legacy_ocr(info) -> tuple[str, str]:
    """Return (true/false/unknown, evidence). `info` is document metadata."""
    def get(key: str) -> str:
        try:
            value = info.get(key) if info else None
            return str(value or "").lower()
        except Exception:
            return ""

    creator, producer = get("/Creator"), get("/Producer")
    if any(m in producer for m in OCR_PRODUCER_MARKERS) or \
       any(m in creator for m in OCR_CREATOR_MARKERS):
        return "true", f"creator={creator[:80]} producer={producer[:80]}".strip()
    if creator or producer:
        return "false", f"creator={creator[:80]} producer={producer[:80]}".strip()
    return "unknown", "no-creator-producer-metadata"


def classify_page(text_len: int, images: int) -> str:
    has_text = text_len >= TEXT_MIN_CHARS
    if has_text and images:
        return "mixed"
    if has_text:
        return "text"
    if images:
        return "image"
    return "empty"


def load_existing(out_dir: Path, digest: str, extractor_version: str) -> dict | None:
    doc_path = out_dir / "doc.json"
    if not doc_path.exists():
        return None
    try:
        existing = json.loads(doc_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if (existing.get("sha256") == digest
            and existing.get("extractor", {}).get("version") == extractor_version
            and existing.get("extractor", {}).get("settings") == SETTINGS):
        return existing
    return None


def extract_entry(pypdf, entry: dict, lib_root: Path, out_dir: Path,
                  password: str | None = None) -> dict:
    ref_id = entry.get("id", "unknown")
    rel = entry.get("path", "")
    dest = out_dir / ref_id
    dest.mkdir(parents=True, exist_ok=True)

    def skipped(reason: str, extra: dict | None = None) -> dict:
        doc = {"ref_id": ref_id, "status": "skipped", "skip_reason": reason,
               "manifest": {k: entry.get(k) for k in
                            ("path", "title", "author", "edition", "year",
                             "jurisdiction", "kind") if entry.get(k) is not None}}
        if extra:
            doc.update(extra)
        (dest / "doc.json").write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
        return doc

    abs_path, external, refusal = safe_resolve(lib_root, rel)
    if refusal:
        return skipped(refusal, {"resolved": str(abs_path)})
    if not abs_path.exists():
        return skipped("missing", {"resolved": str(abs_path), "external": external})
    if not abs_path.is_file():
        return skipped("not-a-file", {"resolved": str(abs_path), "external": external})

    digest = sha256_file(abs_path)
    cached = load_existing(dest, digest, pypdf.__version__)
    if cached is not None:
        print(f"{ref_id}: fresh index, skipped")
        return {**cached, "status": "up-to-date"}

    try:
        reader = pypdf.PdfReader(str(abs_path))
    except Exception as exc:
        return skipped("unreadable", {"reason": f"{type(exc).__name__}: {exc}"})

    if reader.is_encrypted:
        ok = False
        if password:
            try:
                ok = bool(reader.decrypt(password))
            except Exception:
                ok = False
        if not ok:
            return skipped("encrypted", {"reason": "password required; not solicited in P0.2"})

    try:
        n_pages = len(reader.pages)
    except Exception as exc:
        return skipped("unreadable", {"reason": f"page-tree: {type(exc).__name__}: {exc}"})

    legacy, legacy_evidence = detect_legacy_ocr(getattr(reader, "metadata", None))
    sections = outline_sections(reader)
    histogram: dict[str, int] = {}
    tounicode_pages = 0
    failed_pages = 0
    pages_path = dest / "pages.jsonl"
    with open(pages_path, "w", encoding="utf-8") as out:
        for number, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
                images = page_image_count(page)
                fonts_total, fonts_mapped, fonts_suspect = font_tounicode_status(
                    (page.get("/Resources") or {}).get("/Font"))
                if fonts_total and fonts_mapped == fonts_total:
                    tounicode_pages += 1
                cls = classify_page(len(text.strip()), images)
                flags: list[str] = []
                if legacy == "true":
                    flags.append("legacy-ocr-layer")
                if fonts_suspect or (fonts_total and 0 < fonts_mapped < fonts_total):
                    flags.append("encoding-suspect")
                confidence = ("high" if cls in ("text", "mixed") and not flags
                              else "low" if cls in ("text", "mixed") else "unverified")
                record = {"ref_id": ref_id, "page": number, "folio": None,
                          "section": sections.get(number - 1),
                          "class": cls, "method": "direct-text",
                          "chars": len(text), "text": text,
                          "figures": ([{"kind": "image-region",
                                        "note": "manual review required"}]
                                      if images and cls in ("image", "mixed") else []),
                          "flags": flags, "confidence": confidence,
                          "review_status": "unreviewed"}
            except Exception as exc:
                failed_pages += 1
                cls = "failed"
                record = {"ref_id": ref_id, "page": number, "folio": None,
                          "section": sections.get(number - 1),
                          "class": cls, "method": "direct-text",
                          "chars": 0, "text": "",
                          "figures": [], "flags": ["extraction-error"],
                          "confidence": "unverified", "review_status": "unreviewed",
                          "error": f"{type(exc).__name__}: {exc}"}
            histogram[cls] = histogram.get(cls, 0) + 1
            out.write(json.dumps(record, ensure_ascii=False) + "\n")

    doc = {"ref_id": ref_id,
           "manifest": {k: entry.get(k) for k in
                        ("path", "title", "author", "edition", "year",
                         "jurisdiction", "kind") if entry.get(k) is not None},
           "resolved": str(abs_path), "external": external,
           "sha256": digest, "bytes": abs_path.stat().st_size,
           "pages": n_pages,
           "extractor": {"name": EXTRACTOR_NAME, "version": pypdf.__version__,
                         "settings": SETTINGS},
           "legacy_ocr_layer": legacy, "legacy_ocr_evidence": legacy_evidence,
           "outline_sections": len(sections),
           "tounicode_full_pages": tounicode_pages,
           "page_class_histogram": histogram, "failed_pages": failed_pages,
           "status": ("indexed" if not failed_pages
                      else "partial" if failed_pages < n_pages else "failed")}
    (dest / "doc.json").write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    print(f"{ref_id}: {doc['status']} ({n_pages} pages, {histogram})")
    return doc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Tier-1 per-page PDF text extraction (pypdf). No OCR.")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--lib-root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ref-id", help="process a single manifest entry")
    ap.add_argument("--password", default=None,
                    help="TEST-ONLY: exercise the encrypted branch in fixtures")
    args = ap.parse_args(argv)

    pypdf = need_pypdf()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8-sig"))
    entries = manifest.get("references", [])
    if args.ref_id:
        entries = [e for e in entries if e.get("id") == args.ref_id]
        if not entries:
            print(f"unknown ref-id: {args.ref_id}", file=sys.stderr)
            return 2
    out = Path(args.out)
    bad = 0
    for entry in entries:
        try:
            doc = extract_entry(pypdf, entry, Path(args.lib_root), out, args.password)
        except Exception as exc:  # never let one entry kill the batch
            ref_id = entry.get("id", "unknown")
            print(f"{ref_id}: failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
