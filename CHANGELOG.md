# Changelog

All notable changes to the Engineering CAD Agent Skill.

Format follows [Keep a Changelog](https://keepachangelog.com/); versioning
follows [Semantic Versioning](https://semver.org/):

- **PATCH** — documentation, typos, wording, non-behavioral fixes.
- **MINOR** — backward-compatible new workflow, rule, or capability.
- **MAJOR** — breaking behavioral or structural changes.

The npm package (`installer/npm/package.json`) is versioned separately from
the skill: 0.2.0 is the skill, 0.3.0 is the installer, and the tool contract
version is 1. A package-only release does not change the skill version.

No change is recorded here until it actually exists in the repository.

---

## [Unreleased]

### Added

- Multi-agent installs: new `--agent` flag (`opencode` default,
  `claude`, `codex`) across install, update, doctor, and refs. The
  skill directory already follows the Agent Skills open standard, so
  every host loads the same files — only the install roots differ
  (`~/.claude/skills` / `.claude/skills`, `~/.agents/skills` /
  `.agents/skills`). OpenCode-only behavior (config registration,
  permission rules, migration, slash-command wording) is gated to
  OpenCode; all hosts share manifests, backups, validation, and
  reference diagnostics. Manual MCP wiring snippets for Claude Code
  and Codex in the installer README. 8 new tests; suite now 105.

- Portable reference setup: new `autocad-skill refs` command (read-only
  status by default; `refs init` scaffolds the empty global or
  project-local library without ever overwriting), `doctor` reference
  toolchain checks (scripts present, `pypdf` importable, Tesseract
  installed — informational when absent), a fresh-machine guide in
  `docs/references.md`, and a no-absolute-paths rule for skill files
  enforced by Level 1 validation.

## [0.3.0] - 2026-10-11

Reference track release: the skill moves 0.1.0 → 0.2.0 (MINOR —
backward-compatible reference capability), the installer moves
0.2.0 → 0.3.0 (new reference behavior), tool contract stays 1.

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

- Reference lookup inside CAD workflows (P1): new
  `skill/engineering_agent/rules/reference_rules.md` (when/how to
  search, degradation without invention, excerpt/interpretation
  separation, prohibitions on compliance verdicts and handbook-as-code),
  an UNDERSTAND-loop hook plus references entry in `SKILL.md`,
  citation-aware requirement extraction (Steps 1/3/6 with an Evidence
  block), optional `citation` objects on decision/assumption/constraint
  schemas and templates (all existing files stay valid), and a cited
  REQ-006 with evidence block in the simple_room example. Risk, stop,
  verification, MCP-contract, installer, and version behavior unchanged
  by design. Level 1 PASS, secret audit CLEAN, installer suite 91/91.

- Reference search and validation hardening (P0.3/P0.4):
  `tools/ref_search.py` (local keyword search over page indexes,
  stdlib-only, method/confidence labels, explicit no-match reporting),
  outline-section capture in `tools/ref_extract.py` (additive, old
  indexes stay valid), `tests/test_ref_search.py` (15 tests),
  `installer/npm/lib/packcheck.js` (reference content fails the pack,
  historical entries stay warn-only), `doctor` reference-index states
  (fresh/stale/not-built/orphaned, warnings at most), a references
  module in `tests/validate_skill.py` (fixture schema, no committed
  `.index/`, skill-only hygiene patterns), `docs/references.md` user
  guide, and 7 new installer tests (packaging guard, index states).
  Installer suite now 91 tests, all passing; secret audit CLEAN.

- Reference ingestion and extraction (P0.2): `tools/ref_inspect.py`
  (Tier-0 stdlib structural inspection), `tools/ref_extract.py`
  (Tier-1 per-page text extraction, `pypdf==6.20.0` in the opt-in
  `.venv-ref`, pinned in `tools/requirements-ref.txt`), and
  `tests/test_ref_tools.py` (20 tests on hand-built synthetic PDFs:
  text/mixed/image/empty/corrupt/encrypted/partial, path containment,
  incremental rebuild). Local-only runs: ECP203 445 image pages,
  Neufert 640 pages (638 mixed, legacy OCR, no ToUnicode maps),
  Time-Saver 1297 pages (1240 mixed, 143 encoding-suspect) — zero
  failed pages, no OCR performed. `.venv-ref/` gitignored;
  `secret_audit.py` skip list extended to `.venv-ref` (audit CLEAN).

- Reference library foundation (P0.1): `installer/npm/lib/references.js`
  defines the `references.json` manifest schema (stable kebab-case ids,
  required local paths, optional title/author/edition/year/jurisdiction/
  document category with `code` distinguished from `standard`, `handbook`,
  `manufacturer`, `educational`, and `other`), discovers the global
  (`<home>/.config/autocad-skill/references`, honoring
  `AUTOCAD_SKILL_HOME`/`XDG_CONFIG_HOME` like every other global path) and
  project-local (`.opencode/references`) libraries, resolves paths safely
  (relative paths must stay inside the root; absolute paths are allowed but
  flagged external so existing collections are registered without moving
  them), and reports missing files, invalid metadata, duplicate ids, and
  global/project conflicts — never resolving conflicts silently.
  `doctor` gains a read-only Reference library section (missing/empty/
  invalid libraries are warnings at most, never errors). 22 new tests;
  installer suite now 84 tests, all passing.

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
- Test suite: 34 → 61 tests; tests are now hermetic against both the real home
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
- Installer suite: **PASS**, 105 tests (22 reference-library + 7 index/pack-guard + 6 refs-command/toolchain + 8 multi-agent tests). Packaged-tarball smoke test:
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
