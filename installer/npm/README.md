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
| `--local` | Install into `<project>/.opencode/skills/` instead of the global folder |
| `--project <dir>` | Project to operate on; implies `--local` |
| `--global` | OpenCode's global skills folder — this is the default |
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

## Where it installs — and why

OpenCode V2 discovers skills from exactly these locations
(<https://opencode.ai/v2/docs/skills/>):

| Scope | Sources |
|---|---|
| Global | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` |
| Project | `.opencode/skills`, `.claude/skills`, `.agents/skills` (cwd → project root) |

Two rules follow from that table, and both are load-bearing:

1. **The default target is the global source.** `npx autocad-skill` has to work
   from any directory — including one that is not an OpenCode project, and
   including the home directory, which sits *above* the project root and is
   therefore never searched for project sources.
2. **The skill id is the directory name.** The folder is installed as
   `engineering-cad`, so the id — and the TUI slash command — is
   `/engineering-cad`. `SKILL.md`'s frontmatter `name: engineering-cad` carries
   the same value so the display label and the id agree, and `slash: true` keeps
   the skill exposed as a slash command.

> A previous release installed to `<home>/.opencode/skills/engineering_agent/`.
> That path is not a discovery source in either scope, so OpenCode never saw the
> skill. `install` now migrates it (see below).

## install

1. Detects the OS, the OpenCode project root, and the skill directory.
2. Resolves the skill source: `AUTOCAD_SKILL_SOURCE` → the packaged copy → the
   repository checkout.
3. Installs to `~/.config/opencode/skills/engineering-cad/` by default — the
   documented global source OpenCode discovers automatically. `--local` /
   `--project <dir>` install to `<project>/.opencode/skills/engineering-cad/`.
4. **Migrates** an installation left at an old location (see below).
5. Writes `.autocad-skill-manifest.json` — the SHA-256 of every file as the
   installer wrote it. This is what later distinguishes *your* edits from the
   shipped content.
6. Validates the result: required files, `SKILL.md` frontmatter, `skill.json`
   identity, every manifest hash.

**Configuration safety.** The default install writes no configuration at all —
auto-discovery already covers both the global skills folder and
`.opencode/skills/`. An existing `opencode.json` is left byte-for-byte
identical. If another `skills` entry already provides this skill id, the
installer warns and asks before creating a second copy. `--register` is the
explicit opt-in path: it confirms first, backs up the config to
`opencode.json.autocad-skill-backup`, and appends exactly one path while
preserving every other key. A `skills` value that is not an array, or a config
that cannot be parsed, is refused rather than rewritten.

**Re-running** install is a no-op: it reports the installed version, verifies
the hashes, and changes nothing. Locally modified files are listed and left
alone.

### Migration from an older install

If a previous version put the skill somewhere OpenCode does not read, `install`
finds it and moves it:

| | |
|---|---|
| From (global scope) | `<home>/.opencode/skills/engineering_agent/`, `~/.config/opencode/skills/engineering_agent/` |
| From (local scope) | `<project>/.opencode/skills/engineering_agent/` |
| To | `<global or project skills root>/engineering-cad/` |

- The **copy comes first** and is validated before anything else happens. If
  validation fails, the copy is removed and the old installation is untouched.
- **Untouched files are brought up to date.** Files the old installer wrote
  and you never edited are replaced with the current package content — so a
  migrated copy carries the same identity as a fresh install
  (`name: engineering-cad`, `skill.json` id `engineering-cad`) instead of
  freezing the old one. What it refreshed is printed.
- **Everything you wrote travels untouched**: your edits, files you added,
  and files you deleted. Their provenance travels too — the new manifest
  keeps the hash the *installer* last wrote, so a later `update` still sees
  them as yours and still asks before replacing them. Anything kept back is
  listed, with a pointer to `npx autocad-skill update`.
- A copy with **no install manifest** cannot be told apart from your own
  edits, so nothing is refreshed and nothing is overwritten; you are told to
  review it with `update`.
- The old directory is deleted **only** after an explicit confirmation
  (default **[y/N]** = N) or `--yes`. Without a terminal the question is simply
  skipped: the install still succeeds and the path is printed so you can remove
  it by hand.
- Only the legacy skill directory itself is ever removed. Sibling skills,
  parent directories, and anything else in `~/.opencode` are left alone.
- `doctor` reports a leftover as a warning (never an error), and `install`
  offers the migration again on the next run.

`AUTOCAD_SKILL_HOME` overrides the home directory used for every global path
(the test suite uses it so no test can touch a real machine); `XDG_CONFIG_HOME`
overrides `~/.config`, the same override OpenCode documents.

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

Read-only. Checks Node.js, npm, OpenCode, the installed skill, the skill id
and its slash command, whether the install target is a documented OpenCode
discovery source, leftover installations at old locations, the `skill`
permission, skill integrity, local modifications, update availability, the
OpenCode configuration, the autocad-mcp entry, Python, and AutoCAD.

```
✓ Skill ID engineering-cad (OpenCode slash command /engineering-cad)
✓ Skill discovery C:\Users\me\.config\opencode\skills\engineering-cad is a documented OpenCode source
✓ Legacy install none
✓ skill permission allowed by OpenCode's default policy

Summary: 13 passed, 1 warning(s), 0 error(s), 1 not detected
Result: no errors.
```

Exits `1` only when at least one check reports **ERROR** — which now includes a
`permissions` rule that would `deny` the skill (it would be invisible in the
`/` menu) and an install target outside every documented source. Warnings and
"not detected" never fail the run: a leftover old copy and an absent AutoCAD
are warnings, because neither blocks the skill from working.

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
- Layout: `bin/` (argument parsing and dispatch), `lib/` (helpers, migration,
  and the four commands), `scripts/prepack.js` (packaging), `test/`
  (node:test suite).
- Tests: `npm test` — 60 tests covering install detection, the default global
  target, `--local`, migration and its safety rules (refresh, preservation of
  user edits/added files, refusal of an invalid old copy), skill id/discovery
  frontmatter requirements, dry-run, config preservation, local-modification
  detection, update confirmation, rollback, doctor output (including the
  `skill` permission), and invalid environments.
- Package smoke test: `npm pack` then `node scripts/smoke.js` — installs the
  tarball offline into a throwaway prefix and runs the installed binary
  against throwaway homes (49 checks).
- Every test runs against a throwaway directory in the OS temp folder and gets
  its own `AUTOCAD_SKILL_HOME`, so a test can never read or write your real
  `~/.config/opencode` or `~/.opencode`, and never writes into the repository.
- `npm pack` runs `scripts/prepack.js`, which copies
  `skill/engineering_agent/`, `LICENSE`, and `CHANGELOG.md` into the package
  root (npm cannot include files from outside the package). Those copies are
  regenerated on every pack and are gitignored — never commit them.
