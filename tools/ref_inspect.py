#!/usr/bin/env python3
"""Tier-0 standard-library structural PDF inspection (P0.2).

Zero third-party dependencies. Never reads PDF page content as text and
never transcribes anything: it censuses objects (pages, fonts, images,
filters), samples compressed streams for text-operator presence, and
reports a document-level verdict. Per-page classification is Tier-1 work.

Read-only on the source file. Writes only `inspect.json` under --out.

Usage:
    python tools/ref_inspect.py --file doc.pdf --ref-id my-ref --out <dir>
    python tools/ref_inspect.py --manifest refs.json --lib-root <dir> --out <dir>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zlib
from pathlib import Path

VERSION = "0.1.0"
EXTRACTOR_NAME = "ref_inspect"

# Stream-sampling budget: enough to classify, small enough to stay fast on
# hundred-megabyte scans.
MAX_SAMPLE_STREAMS = 40
BULK_TJ_THRESHOLD = 100
SPARSE_TJ_THRESHOLD = 1


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def count_pattern(data: bytes, pattern: bytes) -> int:
    return len(re.findall(pattern, data))


def page_estimate(data: bytes) -> tuple[int, str]:
    """Triangulated page count. Method is always recorded; exact counts are
    Tier-1's job (pypdf reads the real page tree)."""
    counts = sorted({int(x) for x in re.findall(rb"/Count\s+(\d+)", data)})
    raw_pages = count_pattern(data, rb"/Type\s*/Page\b") - count_pattern(data, rb"/Type\s*/Pages\b")
    if counts:
        return counts[-1], "root-pagetree-count"
    if raw_pages > 0:
        return raw_pages, "raw-page-objects"
    return 0, "unavailable"


def sample_text_operators(data: bytes) -> tuple[int, int]:
    """Decompress up to MAX_SAMPLE_STREAMS zlib streams spread across the
    file; return (streams_with_text_ops, total_tj). Binary false positives
    are possible, so Tier-0 only derives a coarse verdict from this."""
    spans = [m.end() for m in re.finditer(rb"stream\r?\n", data)]
    if not spans:
        return 0, 0
    picks = sorted({round(i * (len(spans) - 1) / (MAX_SAMPLE_STREAMS - 1)) for i in range(MAX_SAMPLE_STREAMS)}
                   if len(spans) > 1 else {0})
    with_text = 0
    tj_total = 0
    for i in picks:
        start = spans[i]
        end = data.find(b"endstream", start, start + 8_000_000)
        raw = data[start:end] if end != -1 else b""
        try:
            content = zlib.decompress(raw)
        except Exception:
            continue
        if b"BT" not in content:
            continue
        tj = len(re.findall(rb"\bTj\b", content)) + len(re.findall(rb"\bTJ\b", content))
        if tj:
            with_text += 1
            tj_total += tj
    return with_text, tj_total


def layer_verdict(tj_total: int) -> str:
    """Coarse text-layer verdict from sampled text-operator volume."""
    if tj_total >= BULK_TJ_THRESHOLD:
        return "present-bulk"
    if tj_total >= SPARSE_TJ_THRESHOLD:
        return "present-sparse"
    return "absent"


def info_string(meta_zone: bytes, key: str) -> str | None:
    m = re.search(rb"/" + key.encode() + rb"\s*\((.*?)\)", meta_zone, re.S)
    if m:
        return re.sub(r"\s+", " ", m.group(1).decode("latin-1"))[:200]
    return None


def inspect_file(path: Path, ref_id: str) -> dict:
    data = path.read_bytes()
    size = len(data)
    header = data[:8].decode("latin-1", "replace").split()[0] if data.startswith(b"%PDF-") else "not-a-pdf"
    tail = data[-128:] if size >= 128 else data
    meta_zone = data[:3_000_000] + data[-1_000_000:]
    pages, page_method = page_estimate(data)
    with_text, tj_total = sample_text_operators(data)
    layer = layer_verdict(tj_total)
    streams = len(re.findall(rb"stream\r?\n", data))
    if not data.startswith(b"%PDF-"):
        status, errors = "corrupt", ["missing %PDF header"]
    elif not pages and not streams:
        status, errors = "corrupt", ["no page tree or content streams"]
    else:
        status, errors = "inspectable", []
    if re.search(rb"/Encrypt\b", data):
        # Encryption flag only; Tier-1 decides skipped vs password path.
        errors.append("encrypted-flag-present")
    return {
        "ref_id": ref_id,
        "source_path": str(path),
        "sha256": sha256_file(path),
        "bytes": size,
        "pdf_header": header,
        "has_eof": b"%%EOF" in tail,
        "encrypted": bool(re.search(rb"/Encrypt\b", data)),
        "pages_estimate": pages,
        "pages_estimate_method": page_method,
        "fonts_embedded": count_pattern(data, rb"/BaseFont\b"),
        "tounicode_maps": count_pattern(data, rb"/ToUnicode\b"),
        "image_xobjects": count_pattern(data, rb"/Subtype\s*/Image\b"),
        "filter_census": {
            name: count_pattern(data, rb"/" + name.encode() + rb"\b")
            for name in ("FlateDecode", "DCTDecode", "JPXDecode", "CCITTFaxDecode", "JBIG2Decode")
        },
        "text_layer": layer,
        "sampled_text_streams": with_text,
        "sampled_tj_total": tj_total,
        "info": {k: info_string(meta_zone, k) for k in ("Title", "Author", "Creator", "Producer")},
        "inspector": {"name": EXTRACTOR_NAME, "version": VERSION,
                      "settings": {"max_sample_streams": MAX_SAMPLE_STREAMS,
                                   "bulk_tj_threshold": BULK_TJ_THRESHOLD}},
        "status": status,
        "errors": errors,
    }


def write_inspect(record: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / "inspect.json"
    target.write_text(json.dumps(record, indent=1) + "\n", encoding="utf-8")
    return target


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Tier-0 stdlib PDF structural inspection.")
    ap.add_argument("--file", help="single PDF to inspect")
    ap.add_argument("--ref-id", default="ad-hoc")
    ap.add_argument("--manifest", help="P0.1 references.json (entries resolved under --lib-root)")
    ap.add_argument("--lib-root", default=".")
    ap.add_argument("--out", required=True, help="output directory (inspect.json per ref-id)")
    args = ap.parse_args(argv)

    jobs: list[tuple[str, Path]] = []
    if args.file:
        jobs.append((args.ref_id, Path(args.file)))
    elif args.manifest:
        root = Path(args.lib_root)
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8-sig"))
        for entry in manifest.get("references", []):
            rel = entry.get("path", "")
            candidate = Path(rel) if Path(rel).is_absolute() else root / rel
            jobs.append((entry.get("id", "unknown"), candidate))
    else:
        print("need --file or --manifest", file=sys.stderr)
        return 2

    out = Path(args.out)
    failed = 0
    for ref_id, pdf in jobs:
        dest = out / ref_id
        try:
            record = inspect_file(pdf, ref_id)
        except OSError as exc:
            record = {"ref_id": ref_id, "source_path": str(pdf),
                      "status": "unreadable", "errors": [f"{type(exc).__name__}: {exc}"]}
        target = write_inspect(record, dest)
        print(f"{ref_id}: {record.get('status')} "
              f"(pages~{record.get('pages_estimate')}, layer={record.get('text_layer')}) -> {target}")
        if record.get("status") not in ("inspectable",):
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
