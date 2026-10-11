#!/usr/bin/env python3
"""Gated single-image OCR through a local Tesseract binary (Track C).

Reads NOTHING except the one image file named on the command line.
Writes NOTHING except an optional JSON sidecar under --out. Performs
NO uploads, installs nothing, and never runs unless explicitly invoked:
invocation itself is the opt-in (there is no background or default OCR
anywhere in this project).

The binary is located via --tesseract, else PATH, else the standard
Windows install path. Language data comes from the binary's own
tessdata, overridden by --tessdata-dir or TESSDATA_PREFIX when set.

Usage:
    python tools/ref_ocr.py --image page.jpg --lang ara+eng --out <dir>
    python tools/ref_ocr.py --image cover.jpg --lang eng --psm 6
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

VERSION = "0.1.0"
WELL_KNOWN_WINDOWS = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")


def find_binary(explicit: str | None) -> Path | None:
    if explicit:
        candidate = Path(explicit)
        return candidate if candidate.is_file() else None
    on_path = shutil.which("tesseract")
    if on_path:
        return Path(on_path)
    return WELL_KNOWN_WINDOWS if WELL_KNOWN_WINDOWS.is_file() else None


def engine_version(binary: Path) -> str | None:
    try:
        proc = subprocess.run([str(binary), "--version"], capture_output=True,
                              text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return (proc.stdout or "").splitlines()[0].strip()[:120] or None


def run_ocr(binary: Path, image: Path, lang: str, psm: int,
            tessdata_dir: str | None) -> tuple[int, str, str]:
    cmd = [str(binary), str(image), "stdout", "-l", lang, "--psm", str(psm)]
    if tessdata_dir:
        cmd += ["--tessdata-dir", tessdata_dir]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, "", f"{type(exc).__name__}: {exc}"
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Gated local-Tesseract OCR for one image.")
    ap.add_argument("--image", required=True)
    ap.add_argument("--lang", default="eng")
    ap.add_argument("--psm", type=int, choices=tuple(range(14)), default=3)
    ap.add_argument("--tesseract", default=None)
    ap.add_argument("--tessdata-dir", default=None)
    ap.add_argument("--out", default=None, help="directory for the <stem>.ocr.json sidecar")
    args = ap.parse_args(argv)

    image = Path(args.image)
    if not image.is_file():
        print(f"missing image file: {image}", file=sys.stderr)
        return 1

    binary = find_binary(args.tesseract)
    if binary is None:
        print("ocr-unavailable: no Tesseract binary found (pass --tesseract, "
              "or install it first); nothing was changed.", file=sys.stderr)
        return 3
    version = engine_version(binary)
    if version is None:
        print(f"ocr-unavailable: {binary} did not report a version.", file=sys.stderr)
        return 3

    tessdata = args.tessdata_dir or os.environ.get("TESSDATA_PREFIX")
    code, text, errors = run_ocr(binary, image, args.lang, args.psm, tessdata)
    record = {"method": "ocr", "engine": version, "binary": str(binary),
              "langs": args.lang, "psm": args.psm,
              "tessdata": tessdata or "binary-default",
              "image": str(image), "chars": len(text), "text": text,
              "returncode": code, "stderr_tail": errors[-500:]}
    if args.out:
        dest = Path(args.out)
        dest.mkdir(parents=True, exist_ok=True)
        sidecar = dest / (image.stem + ".ocr.json")
        sidecar.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n",
                           encoding="utf-8")
        print(f"wrote {sidecar} ({len(text)} chars)")
    else:
        print(json.dumps(record, ensure_ascii=False, indent=1))
    return 0 if code == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
