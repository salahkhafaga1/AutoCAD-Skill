# Changelog

All notable changes to the Engineering CAD Agent Skill.

Format follows [Keep a Changelog](https://keepachangelog.com/); versioning
follows [Semantic Versioning](https://semver.org/):

- **PATCH** — documentation, typos, wording, non-behavioral fixes.
- **MINOR** — backward-compatible new workflow, rule, or capability.
- **MAJOR** — breaking behavioral or structural changes.

The npm package (`installer/npm/package.json`) is versioned separately from
the skill: 0.1.0 is the skill, 0.2.0 is the installer, and the tool contract
version is 1. A package-only release does not change the skill version.

No change is recorded here until it actually exists in the repository.

---

## [0.2.0] - 2026-10-08

npm installer release. **The skill itself is unchanged** — every file under
`skill/engineering_agent/` is byte-identical to 0.1.0 and `skill.json` stays
at 0.1.0. The 0.2.0 version belongs to the `autocad-skill` npm package only.

### Added

- `autocad-skill install` — copies the skill to
  `.opencode/skills/engineering_agent/`, or to
  `~/.config/opencode/skills/engineering_agent/` with `--global`, writes a
  SHA-256 manifest of what it wrote, and validates the result. Re-running is
  a no-op. The default install writes no configuration at all, so an existing
  `opencode.json` stays byte-for-byte identical.
- `autocad-skill update` — prints current and available versions, every file
  to be added, changed, or removed, and any locally modified files; requires
  explicit confirmation with the default **[y/N] = N**; copies the installed
  skill to a backup outside the skills root before writing; re-validates
  afterwards. Non-interactive runs without `--yes` abort with exit code 2 and
  change nothing.
- `autocad-skill update --rollback` — restores the most recent backup,
  removing files the update added and keeping files edited after it.
- `autocad-skill doctor` — read-only checks of Node, npm, OpenCode, the
  installed skill, integrity, local modifications, update availability, the
  OpenCode configuration, autocad-mcp, Python, and AutoCAD. Exits non-zero
  only when a check reports an error.
- `autocad-skill version` — prints skill, installer, and tool-contract
  versions, plus the installed version when it differs from the available one.
- Options: `--dry-run` on every command, `--yes` for scripts, `--project` for
  an explicit target, and opt-in `--register`, which confirms before adding a
  `skills` entry and backs the config file up first.
- `installer/npm/test/` — 34 tests using Node's built-in test runner with no
  dependencies, every one of them against a throwaway directory in the OS temp
  folder. No test writes into the repository or into a real OpenCode project.

### Changed

- `installer/npm/package.json` 0.1.0 → 0.2.0. The four commands are no longer
  interface stubs; they perform the behavior described above.
- `installer/npm/README.md` rewritten from a behavior spec into documentation
  of the implemented behavior.
- `README.md`, `docs/installation.md`, `docs/configuration.md`,
  `docs/development.md`, `docs/architecture.md`, and `docs/verification.md`
  updated to mark the installer IMPLEMENTED instead of PLANNED.
- `.gitignore` now excludes the package copies that the prepack step
  generates.

### Compatibility notes

- No skill behavior, rules, risk model, or verification semantics changed.
- `autocad-mcp` remains an external, separate dependency — not bundled, not
  forked, never modified by this project.
- Verification status: Level 1 static validation **PASS**; Level 2 offline
  MCP tests **PASS** (105); Level 3 discovery/wiring **PASS**; Level 4 live
  AutoCAD **PENDING** (not claimed); installer test suite **PASS** (34).

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
  autocad-mcp checkout); Level 3 discovery/wiring **PASS** (post-restructure
  live reload: skill loaded from `skill/engineering_agent/`, 29 MCP tools);
  Level 4 live AutoCAD **PENDING** (no AutoCAD on the development
  machine — not claimed).

### Pre-release development (not separately versioned)

- Skill authored, then audited and hardened: obsolete tool references
  removed, verification claims corrected to the honest evidence model,
  duplicate-prevention and state-sync rules tightened, tool contracts
  re-validated against the real MCP schemas.
- Packaged for Git: initial commit `6267fa3` ("Initial release: Engineering
  CAD Agent Skill v0.1.0") with README, LICENSE, .gitignore, example config.
- Restructured to the standard layout approved for ongoing development.
