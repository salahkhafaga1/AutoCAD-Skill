# autocad-skill — installer layer

Distribution and update layer for the **Engineering CAD Agent Skill**.

| | |
|---|---|
| Package name | `autocad-skill` (verified available on the npm registry) |
| Package version | 0.2.0 |
| Skill version | 0.1.0 (`skill/engineering_agent/skill.json`) |
| Tool Contract version | 1 |
| Node | >= 18, zero runtime dependencies |
| Status | **IMPLEMENTED** — install, update, doctor, version all work |

The three versions above are logically separate: the skill's own version does
not change just because the installer does. `autocad-skill version` prints all
three.

The skill itself stays plain Markdown/JSON consumed by OpenCode. This package
never converts the skill to JavaScript, never bundles autocad-mcp, and never
modifies autocad-mcp.

## Commands

```
npx autocad-skill                 # same as: install
npx autocad-skill install
npx autocad-skill update
npx autocad-skill update --rollback
npx autocad-skill doctor
npx autocad-skill version
npx autocad-skill help
```

### Options

| Option | Effect |
|---|---|
| `--project <dir>` | Operate on this project (default: walk up from the cwd, the way OpenCode does) |
| `--global` | Operate on `~/.config/opencode/skills/` instead of the project |
| `--yes`, `-y` | Skip confirmation prompts (scripts, CI, non-interactive runs) |
| `--dry-run` | Print the plan and exit without changing anything |
| `--register` | `install` only: also append the skill path to the `skills` array in `opencode.json` |
| `--rollback` | `update` only: restore the most recent backup |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, or nothing to do (already installed / up to date) |
| `1` | Error: invalid environment, unreadable config, failed validation |
| `2` | Aborted: the user declined, or confirmation was required without a terminal |

Exit code `2` is deliberate: a non-interactive run never hangs waiting for a
prompt, and it never silently proceeds on a destructive action either.

## install

1. Detects the OS, the OpenCode project root, and the skill directory.
2. Resolves the skill source: `AUTOCAD_SKILL_SOURCE` → the packaged copy → the
   repository checkout.
3. Installs to `<project>/.opencode/skills/engineering_agent/`, the location
   OpenCode discovers automatically. `--global` uses
   `~/.config/opencode/skills/engineering_agent/`.
4. Writes `.autocad-skill-manifest.json` — the SHA-256 of every file as the
   installer wrote it. This is what later distinguishes *your* edits from the
   shipped content.
5. Validates the result: required files, `SKILL.md` frontmatter, `skill.json`
   identity, every manifest hash.

**Configuration safety.** The default install writes no configuration at all —
auto-discovery already covers `.opencode/skills/`. An existing `opencode.json`
is left byte-for-byte identical. If another `skills` entry already provides
this skill id, the installer warns and asks before creating a second copy.
`--register` is the explicit opt-in path: it confirms first, backs up the
config to `opencode.json.autocad-skill-backup`, and appends exactly one path
while preserving every other key. A `skills` value that is not an array, or a
config that cannot be parsed, is refused rather than rewritten.

**Re-running** install is a no-op: it reports the installed version, verifies
the hashes, and changes nothing. Locally modified files are listed and left
alone.

## update

Shows the plan before touching anything:

```
Current version:   0.1.0
Available version: 0.2.0  (MINOR)

Files that will be updated:
  rules/planning_rules.md
Files that will be added:
  workflows/extra_workflow.md
Files that will be removed (a copy goes into the backup):
  workflows/plan_only.md

STOP: 1 locally modified file(s) would be overwritten:
  SKILL.md

Your current versions are preserved in the backup created before applying.
Roll back at any time with: npx autocad-skill update --rollback

Possible conflicts (modified locally AND changed in the new version):
  SKILL.md

This update changes Agent behavior.
Apply update? [y/N]
```

The default is **N**. Nothing is written until the answer is `y`, or `--yes`
was passed. With no terminal and no `--yes`, the update aborts with exit code 2
and leaves every file untouched.

Before applying, the whole installed skill is copied to
`<project>/.autocad-skill-backups/<timestamp>-v<version>/`. That directory sits
*outside* the skills root on purpose, so a backup of `SKILL.md` can never be
discovered as a duplicate skill. Files you added yourself are never deleted;
files the installer wrote are removed only when the new version drops them, and
they are in the backup first. After applying, the result is validated again —
if validation fails, the backup path and the rollback command are printed.

### rollback

```
npx autocad-skill update --rollback
```

Restores the most recent backup: files it contains come back, files the update
added are removed, and any file you edited *after* the update is kept and
reported. Confirmed before applying unless `--yes`.

## doctor

Read-only. Checks Node.js, npm, OpenCode, the installed skill, skill
integrity, local modifications, update availability, the OpenCode
configuration, the autocad-mcp entry, Python, and AutoCAD.

```
Summary: 9 passed, 1 warning(s), 0 error(s), 1 not detected
Result: no errors.
```

Exits `1` only when at least one check reports **ERROR**. Warnings and "not
detected" never fail the run — AutoCAD being absent is a warning, not an
error, because it is not required for install or validation.

`doctor` writes nothing: it does not create, modify, or delete any file.

## version

Prints exactly:

```
Engineering CAD Agent
Skill version: 0.1.0
Installer version: 0.2.0
Tool Contract version: 1
```

A fifth line, `Installed skill version: X`, appears only when the installed
copy differs from the available one.

## What this tool does not do

- It does not install, modify, or fork autocad-mcp. It only reports whether
  the `autocad-mcp` entry in your config looks sane.
- It does not start AutoCAD or OpenCode.
- It does not claim live behavior. Live verification is Level 4 and is
  **PENDING** — see `docs/verification.md`.

## Development

- Zero dependencies, no build step. Entry point: `bin/autocad-skill.js`.
- Layout: `bin/` (argument parsing and dispatch), `lib/` (helpers and the four
  commands), `scripts/prepack.js` (packaging), `test/` (node:test suite).
- Tests: `npm test` — 34 tests covering install detection, dry-run, config
  preservation, local-modification detection, update confirmation, rollback,
  doctor output, and invalid environments. Every test runs against a throwaway
  directory in the OS temp folder; no test writes into the repository or into
  your real OpenCode project.
- `npm pack` runs `scripts/prepack.js`, which copies
  `skill/engineering_agent/`, `LICENSE`, and `CHANGELOG.md` into the package
  root (npm cannot include files from outside the package). Those copies are
  regenerated on every pack and are gitignored — never commit them.
