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
| 3 — MCP wiring | Skill advertisement + MCP tool discovery in OpenCode | **PASS (2026-10-08, post-restructure)** — skill re-discovered and loaded live as `engineering_agent` with base directory `skill/engineering_agent/`; MCP server exposes 29 tools (config untouched) |
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
| Installer tests | CLI behavior of install, update, rollback, doctor, version | **PASS** — 34 tests, run with `npm test` in `installer/npm/`, zero dependencies |

What it covers: install detection, re-run no-op, dry-run creating nothing,
`opencode.json` preservation byte-for-byte, registration with backup and
idempotence, local-modification detection, update confirmation refusing
non-interactive runs with exit code 2, apply-after-`--yes` with backup,
rollback, doctor output and exit codes, and invalid environments.

What it does **not** cover: live AutoCAD, OpenCode at run time, and any
claim about skill behavior — those remain Level 3 / Level 4 territory.
