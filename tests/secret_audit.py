"""Pre-packaging secret audit for the Engineering CAD Agent Skill.

Reports ONLY file/line/pattern-name. It never prints a matched value, so a
real credential cannot leak into a log, a terminal scrollback, or a chat.

Run:
    python tests/secret_audit.py
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_DIRS = {".git", "node_modules", ".venv", ".venv-ref", "__pycache__", ".pytest_cache", ".mypy_cache"}
SKIP_EXT = (".png", ".jpg", ".jpeg", ".gif", ".pdf", ".pyc", ".pyo", ".ico", ".zip", ".7z")
MAX_BYTES = 2_000_000

PATTERNS = {
    "private-key-block": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "aws-access-key": r"AKIA[0-9A-Z]{16}",
    "github-pat": r"gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}",
    "slack-token": r"xox[baprs]-[A-Za-z0-9-]{10,}",
    "npm-token": r"npm_[A-Za-z0-9]{36}",
    "openai-style-key": r"\bsk-[A-Za-z0-9]{32,}",
    "google-api-key": r"AIza[0-9A-Za-z_-]{35}",
    "bearer-header": r"(?i)authorization[\"'\s:=]+bearer\s+[A-Za-z0-9._-]{20,}",
    "credential-assignment": (
        r"(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)"
        r"\s*[:=]\s*[\"'][^\"'\s]{8,}[\"']"
    ),
    "dotenv-secret": r"(?i)^[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|API_KEY)[A-Z0-9_]*\s*=\s*\S+",
}

BANNED_NAMES = {".env", "credentials.json", "id_rsa", "id_ed25519", ".npmrc", ".pypirc"}
BANNED_EXT = (".key", ".pem", ".p12", ".pfx", ".jks", ".keystore", ".tgz", ".tar", ".gz", ".log")


def compile_patterns() -> dict[str, re.Pattern[str]]:
    return {name: re.compile(rx) for name, rx in PATTERNS.items()}


def main() -> int:
    pats = compile_patterns()
    files_scanned = 0
    hits: list[str] = []
    banned: list[str] = []
    total_bytes = 0

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in list(dirnames) + filenames:
            low = name.lower()
            if low in BANNED_NAMES or low.endswith(BANNED_EXT):
                rel = os.path.relpath(os.path.join(dirpath, name), ROOT)
                banned.append(rel.replace(os.sep, "/"))

        for name in filenames:
            if name.endswith(SKIP_EXT):
                continue
            path = os.path.join(dirpath, name)
            try:
                size = os.path.getsize(path)
                if size > MAX_BYTES:
                    continue
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    text = fh.read()
            except OSError:
                continue
            files_scanned += 1
            total_bytes += size
            for pname, rx in pats.items():
                for match in rx.finditer(text):
                    line = text.count("\n", 0, match.start()) + 1
                    rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
                    hits.append(f"{rel}:{line}: {pname}")

    print(f"FILES_SCANNED {files_scanned} ({total_bytes} bytes)")
    print(f"PATTERN_HITS {len(hits)}")
    for hit in hits[:50]:
        print(f"HIT {hit}")
    print(f"BANNED_NAMES {len(banned)}")
    for item in banned[:50]:
        print(f"BANNED {item}")

    ok = not hits and not banned
    print("RESULT " + ("CLEAN" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
