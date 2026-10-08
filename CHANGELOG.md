# Changelog

All notable changes to the Engineering CAD Agent Skill.

Format follows [Keep a Changelog](https://keepachangelog.com/); versioning
follows [Semantic Versioning](https://semver.org/):

- **PATCH** — documentation, typos, wording, non-behavioral fixes.
- **MINOR** — backward-compatible new workflow, rule, or capability.
- **MAJOR** — breaking behavioral or structural changes.

No change is recorded here until it actually exists in the repository.

---

## [0.1.0] - 2026-10-08

First release. No earlier public release exists; nothing prior was ever
published to GitHub or npm. This entry documents what this release contains
and the work actually performed to reach it.

### Added

- Standard repository structure: `skill/engineering_agent/` (SKILL.md,
  workflows/, rules/, schemas/, templates/, examples/, tool_contracts.md)
  with `tests/`, `docs/`, `installer/npm/`, `CHANGELOG.md` at repository root.
- `skill.json` version manifest (identity, version, tool-contract version,
  required MCP server).
- `README.md` (architecture, quick start, structure, testing, roadmap),
  `LICENSE` (MIT), `.gitignore`, `opencode.example.json` (placeholder-only
  OpenCode wiring example).
- `docs/` — architecture, installation, configuration, development,
  verification. Every capability is marked IMPLEMENTED or PLANNED.
- `installer/npm/` — package interface and structure only
  (`package.json`, CLI entry, README behavior spec). **All commands are
  PLANNED; none are implemented in 0.1.0.**
- `tests/validate_skill.py` — Level 1 static validation: referenced skill
  files and repo-doc paths, MCP tool names, parameter names against the real
  autocad-mcp schemas, forbidden/obsolete patterns.

### Changed

- Repository reorganized from the flat skill layout to the standard
  structure. **Pure file moves — skill content is byte-identical**; the only
  content edits were to `tests/validate_skill.py` (path resolution),
  `README.md` (structure/install sections), `opencode.example.json` and
  `.gitignore` (new layer).

### Compatibility notes

- Skill ID remains `engineering_agent` (directory name unchanged); requires
  OpenCode V2 skill discovery via the `skills` array
  (`"skills": ["engineering_agent/skill"]` relative to the project folder).
- `autocad-mcp` remains an external, separate dependency — not bundled,
  not forked, never modified by this project.
- Verification status in 0.1.0: Level 1 static validation **PASS**;
  Level 2 offline MCP tests **PASS** (run against the external
  autocad-mcp checkout); Level 3 discovery/wiring **PASS** pre-restructure
  and scheduled for re-verification; Level 4 live AutoCAD **PENDING**
  (no AutoCAD on the development machine — not claimed).

### Pre-release development (not separately versioned)

- Skill authored, then audited and hardened: obsolete tool references
  removed, verification claims corrected to the honest evidence model,
  duplicate-prevention and state-sync rules tightened, tool contracts
  re-validated against the real MCP schemas.
- Packaged for Git: initial commit `6267fa3` ("Initial release: Engineering
  CAD Agent Skill v0.1.0") with README, LICENSE, .gitignore, example config.
- Restructured to the standard layout approved for ongoing development.
