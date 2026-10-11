# Verification

Status: **IMPLEMENTED policy** — this document defines what verification
may claim, and the honest status of every test level.

## What the current MCP integration CAN verify

- Operation / tool call results
- Entity existence and handles
- Layer, object type, and entity counts
- Screenshots (in-memory image inspection)
- Save / operation results
- Visual alignment when observable in the screenshot

## What it CANNOT verify — do not claim otherwise

- **No independent coordinate-level geometry read-back.** The MCP layer
  exposes no entity endpoints, vertices, or centers.
- A dimension measured between agent-supplied points is a
  **unit/measurement sanity check**, never independent proof of geometry.

MVP verification therefore relies on handle/existence checks, layer/type/
count inspection, screenshot inspection, and operation results.

## Geometry read-back — future capability gate

A geometry read-back mechanism may be added to the verification model only
after **all five** steps, in order:

1. Confirm the actual MCP capability (inspect the real server).
2. Test it against live AutoCAD.
3. Document the new capability.
4. Update the verification rules.
5. Add tests.

Until then, no document in this repository may describe coordinate-level
verification as available.

## Test level status

| Level | Scope | Status (2026-10-08) |
|-------|-------|---------------------|
| 1 — Static skill validation | File/tool/parameter/forbidden checks | **PASS** — automated, re-run after every change (`python tests/validate_skill.py`) |
| 2 — Offline MCP tests | MCP server without AutoCAD | **PASS** — 105 tests, run against the external autocad-mcp checkout (no AutoCAD required) |
| 3 — MCP wiring | Skill advertisement + MCP tool discovery in OpenCode | **PASS (2026-10-08, post-restructure; re-observed after the distribution fix)** — the running session advertises two entries: `engineering_agent` (project `opencode.json` → `skill/engineering_agent/`, the pre-fix registration) and `engineering-cad` (global `~/.config/opencode/skills/engineering-cad`, written by the installer — the binary `npx autocad-skill` runs). MCP config untouched; autocad-mcp still exposes 29 tools. The `/` **menu UI itself was not driven** — no `opencode` TUI is installed here. |
| 4 — Live AutoCAD | Real drawing operations end to end | **PENDING** — AutoCAD is not installed on the development machine. **Not tested, not claimed.** |

Rules for updating this table:

- A level may move to PASS only when its evidence exists (command output,
  session proof, live run).
- Level 4 requires a real AutoCAD session — never infer it from offline
  results.
- Every status change is recorded in `CHANGELOG.md`.

## Installer test suite — separate from the four levels

The npm distribution layer has its own automated suite. It is **not** a test
level: it verifies the installer's file and configuration handling only, and
it proves nothing about AutoCAD or about skill behavior at run time.

| Suite | Scope | Status (2026-10-08) |
|-------|-------|---------------------|
| Installer tests | CLI behavior of install, migration, update, rollback, doctor, version | **PASS** — 91 tests, run with `npm test` in `installer/npm/`, zero dependencies |
| OpenCode discovery checks | Install target, skill ID, frontmatter, `skill` permission | **PASS (structural)** — automated inside the installer suite; verifies OpenCode V2's documented source paths, the `engineering-cad` ID, `name`/`description`/`slash` frontmatter, and the absence of a hiding `permissions` rule |
| Packaged-tarball smoke test | What a user actually downloads from npm | **PASS** — 49 checks via `node scripts/smoke.js` after `npm pack`: installs the tarball offline into a throwaway prefix, runs the installed binary, and verifies target, ID, frontmatter, migration refresh, and refusal of an invalid old install |
| Package contents audit | What `npm publish` would upload | **PASS** — `npm pack --dry-run`: 65 files, 98.9 kB; `test/` and `scripts/` excluded; reference tools ship (`tools/*.py`, no bytecode); no PDF, index, manifest, or venv paths in the file list; packaged skill byte-identical to the repository source (38/38 SHA-256); `tests/secret_audit.py` **CLEAN** (134 files, 0 pattern hits, 0 banned names) |
| OpenCode skill discovery (live) | The skill actually listed by a running OpenCode | **PASS (skill list)** — after a local install to `~/.config/opencode/skills/engineering-cad`, the running session refreshed its skill list and advertised `<id>engineering-cad</id>` (previously only `engineering_agent`, which is not a discoverable ID). The `/` **menu UI itself was not driven** — no `opencode` TUI is installed here — so "the entry renders as `/engineering-cad` in the menu" is **not claimed**. |

What the installer suite covers: default global target and its documented
path shape, `--local` project scope, migration from the old, undiscovered
location (copy-before-delete, validation before deletion, **refresh of files
the old installer wrote and the user never edited**, **user edits, added
files, and deletions preserved with their provenance so `update` still asks**,
confirmation defaulting to `[y/N] = N`, siblings and parents untouched,
non-interactive runs never aborting, invalid old copies refused rather than
migrated), skill ID and frontmatter discovery requirements,
install detection, re-run no-op, dry-run creating nothing, `opencode.json`
preservation byte-for-byte, registration with backup and idempotence,
local-modification detection, **a user-added file surviving consecutive
updates**, update confirmation refusing non-interactive
runs with exit code 2, apply-after-`--yes` with backup, rollback, doctor
output and exit codes (including the `skill` permission rules), and invalid
environments.

What it does **not** cover: live AutoCAD, OpenCode at run time, the `/`
menu actually listing `/engineering-cad`, and any claim about skill behavior
— those remain Level 3 / Level 4 territory.
