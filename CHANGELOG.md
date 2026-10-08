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

## [Unreleased]

**Not released.** The npm package version is still 0.2.0, which is already
published — a new package version (0.2.1) must be cut before the changes below
can be published. See `docs/development.md` for the release steps.

### Fixed

- **The installed skill was invisible to OpenCode.** `npx autocad-skill`
  defaulted to a project-scoped install and fell back to the current
  directory, so running it from the home directory wrote to
  `<home>/.opencode/skills/engineering_agent/`. That path is not an OpenCode V2
  discovery source in either scope, so the skill was never advertised and never
  appeared in the `/` menu. The default target is now
  `~/.config/opencode/skills/engineering-cad/`, a documented global source;
  `--local` / `--project <dir>` still install into
  `<project>/.opencode/skills/engineering-cad/`.
- **Skill ID.** OpenCode derives the skill ID from the directory name and uses
  the frontmatter `name` as its display label, so the effective identity was
  `engineering_agent` / `engineering-cad-agent` rather than the intended
  `engineering-cad`. The install directory, the frontmatter `name`, and
  `skill.json`'s `id` are now all `engineering-cad`, making the slash command
  `/engineering-cad`.
- `version` resolved its target as project-scoped regardless of flags, so it
  could not see a globally installed copy.
- **`update` could delete a file the user added.** After applying an update it
  re-hashed the whole target directory into the manifest, which recorded the
  user's own files as installer output — so the *next* update classified them
  as stale and removed them. The manifest is now written from provenance
  (shipped file → the hash just written; anything else → the hash the installer
  last recorded, or nothing at all), so user-added files stay untracked and
  survive every update, and user-edited files keep reading as edits.

### Added

- Migration of installations at old, undiscovered locations: the copy is made
  and validated first, and the old directory is removed only after an explicit
  confirmation defaulting to **[y/N] = N** (or `--yes`). Without a terminal the
  removal is skipped rather than aborting the install. Only the legacy skill's
  own directory is ever deleted — sibling skills and parent directories are
  untouched. Files the old installer wrote and the user never edited are
  brought up to date from the current package (so a migrated copy carries the
  fixed identity, not the old one), while user edits, user-added files, and
  user deletions travel untouched *with their provenance*, so a later `update`
  still treats them as the user's and still asks first. A copy with no install
  manifest is carried over completely unchanged, with a pointer to `update`.
- `--local` flag; `--project <dir>` now implies project scope.
- `doctor` checks for the skill ID and its slash command, whether the install
  target is a documented discovery source, leftover installations at old
  locations (warning), and any `permission` rule whose `skill` action would
  `deny` (error) or `ask` (warn) the skill.
- `AUTOCAD_SKILL_HOME` overrides the home directory used for global paths, so
  the test suite cannot touch a real machine's `~/.config/opencode` or
  `~/.opencode`.

### Changed

- `skill/engineering_agent/SKILL.md` frontmatter only: `name` is now
  `engineering-cad` (was `engineering-cad-agent`) and `slash: true` was added.
  The body, the rules, the workflows, the schemas, the templates, and every
  engineering, risk, and verification semantic are unchanged. Level 1
  validation re-run: PASS, 0 violations.
- `skill/engineering_agent/skill.json`: `id` is now `engineering-cad`,
  `name` is now the display string `Engineering CAD Agent`. The skill version
  stays 0.1.0 and the tool contract version stays 1.
- Test suite: 34 → 60 tests; tests are now hermetic against both the real home
  directory and stale packaged build artifacts, and cover migration refresh,
  preservation of user edits/added files/deletions, refusal of an invalid old
  copy, and a user-added file surviving consecutive updates.
- Packaged-tarball smoke test added: `node scripts/smoke.js` (after
  `npm pack`) installs the real tarball offline into a throwaway prefix and
  exercises `help`, `version`, `install`, `doctor`, `update`, and migration
  against throwaway homes — 49 checks, no writes outside the sandbox.

### Verification

- Level 1 static skill validation: **PASS**, 0 violations (31 references,
  29 MCP tools, 339 parameters) — re-run after the frontmatter change.
- Level 2 offline MCP tests: **PASS**, 105 tests against the external
  `autocad-mcp` checkout (unchanged this round).
- Level 3 MCP wiring: **PASS**, re-observed — the running session now
  advertises `engineering-cad` from the global install alongside the
  project registration `engineering_agent`. The `/` menu UI was not driven.
- Level 4 live AutoCAD: **PENDING** — AutoCAD is not installed on this
  machine. **Not tested, not claimed.**
- Installer suite: **PASS**, 61 tests. Packaged-tarball smoke test:
  **PASS**, 49 checks. `npm pack --dry-run`: 57 files, 79.1 kB. Packaged skill
  byte-identical to the repository source (38/38 SHA-256). Secret audit:
  **CLEAN** (118 files, 0 pattern hits, 0 banned names).

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
