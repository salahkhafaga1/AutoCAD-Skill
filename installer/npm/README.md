# autocad-skill — installer layer

Distribution and update layer for the **Engineering CAD Agent Skill**.

| | |
|---|---|
| Package name | `autocad-skill` (verified available on the npm registry) |
| Version | 0.1.0 (aligned with `skill/engineering_agent/skill.json`) |
| Status in 0.1.0 | **STRUCTURE ONLY — every command is PLANNED** |

The skill itself is plain Markdown/JSON consumed by OpenCode. This package
never converts the skill to JavaScript and never bundles autocad-mcp.

## Commands — all PLANNED

```
npx autocad-skill install     # PLANNED
npx autocad-skill update      # PLANNED
npx autocad-skill doctor      # PLANNED
npx autocad-skill version     # PLANNED
```

Running any command today prints its planned behavior and exits non-zero so
no automation can mistake the stub for completed work.

## Specified behavior (PLANNED — not implemented)

### install
- Locate an OpenCode project (explicit path argument or working directory).
- Copy `skill/engineering_agent/` into the project skill location, or add
  the `skills` entry — whichever applies; never both.
- **Configuration safety:** read an existing `opencode.json` first, preserve
  all unrelated keys, add only the required skill entry, detect conflicts,
  request confirmation when needed. Never replace a config wholesale.
- Verify discovery afterwards (Level 3 check).

### update
- Read the installed version from `skill.json`.
- Compare against the available version; classify the change
  (PATCH / MINOR / MAJOR — see `docs/development.md`).
- Show what will change before touching anything.
- **Detect local modifications** in `SKILL.md`, `rules/*`, `workflows/*`,
  `schemas/*`, `templates/*`:
  - no modifications → proceed only after confirmation,
  - modifications → report affected files, offer a safe migration/merge
    path, and never overwrite user changes.
- Never silently overwrite a customized local skill. Confirmation is
  mandatory for anything that can change agent behavior; documentation-only
  updates may be classified separately but default behavior stays
  conservative.

### doctor
- Skill integrity (expected structure, manifest present and parseable).
- OpenCode wiring (`skills` entry resolves to a directory containing the
  skill, MCP block well-formed).
- autocad-mcp availability (venv entry point exists — reported, never
  installed or modified by this tool).

### version
- Read and print the installed `skill.json` (identity, version,
  tool-contract version).

## Update confirmation model (spec)

```
Engineering CAD Agent Skill update available.

Current: v0.1.0
New: v0.2.0

Changes:
- Updated planning rules
- Added recovery workflow

Apply update? [y/N]
```

Default is **N**. No update, configuration write, or skill file change ever
happens without explicit confirmation.

## Rollback (PLANNED)

Where practical: keep the previous skill version until the new one is
validated, restore it if verification fails.

## Development

- Structure only — no dependencies, no build step.
- Entry point: `bin/autocad-skill.js` (Node 18+).
- The skill source of truth is `skill/engineering_agent/` in this
  repository; this package references it, it does not contain it.
