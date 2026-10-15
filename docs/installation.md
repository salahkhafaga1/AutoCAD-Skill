# Installation

Status markers: **IMPLEMENTED** = works today; **PLANNED** = designed, not
yet built (see `installer/npm/README.md`).

## Prerequisites

- **Windows** (AutoCAD automation via autocad-mcp is Windows-only)
- **OpenCode V2** (skill discovery via the `skills` configuration array)
- **Python 3.10+** — for the autocad-mcp virtual environment and for the
  skill validator
- **A checkout of autocad-mcp** — a separate repository
  ([Slacker-LLC/autocad-mcp](https://github.com/Slacker-LLC/autocad-mcp))
  installed into its own virtual environment; this project never bundles it
- **AutoCAD** — required only for live use (Level 4); not required for
  validation or offline MCP tests

## Install the skill — IMPLEMENTED (manual)

1. Clone this repository anywhere:

   ```powershell
   git clone https://github.com/salahkhafaga1/AutoCAD-Skill.git
   ```

2. Register the skill in your project's `opencode.json` (paths are relative
   to the project working directory):

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "skills": ["path/to/AutoCAD-Skill/skill"]
   }
   ```

   The skill directory is `skill/engineering_agent/`; OpenCode derives the
   skill ID from the **directory name** at any depth under the source path, so
   this manual path yields the ID `engineering_agent`.

   Alternative (project `.opencode` folder): copy the
   `skill/engineering_agent/` folder to
   `.opencode/skills/engineering-cad/` — discovered automatically, with the ID
   `engineering-cad`, invocable as `@engineering-cad`. Use `npx
   autocad-skill` instead if you want the same ID as the published package;
   it installs into `~/.config/opencode/skills/engineering-cad/` and migrates
   this manual copy if one exists at an older location.

3. Register the MCP server in the same `opencode.json` — see
   `opencode.example.json` at the repository root and
   `docs/configuration.md`.

4. Validate the installation:

   ```powershell
   python tests/validate_skill.py
   ```

   Full parameter-vs-schema checks require the autocad-mcp checkout to be
   findable above the skill folder; otherwise the validator runs in a clearly
   reported degraded mode.

## Install via npx — IMPLEMENTED (installer 0.5.0; reference tools ship since 0.3.0)

```
npx autocad-skill install
npx autocad-skill update
npx autocad-skill doctor
npx autocad-skill version
```

The package lives in `installer/npm/` and is published as `autocad-skill`.
Its behavior is documented in `installer/npm/README.md`; the important points:

- The default install copies the skill to
  `~/.config/opencode/skills/engineering-cad/`, a documented global OpenCode
  source, so it works from any directory and changes **no** configuration. An
  existing `opencode.json` stays byte-for-byte identical; `--register` is the
  explicit opt-in that confirms first, backs the config up, and appends one
  path. Use `--local` (or `--project <dir>`) to install into
  `<project>/.opencode/skills/engineering-cad/` instead.
- The skill is registered under the ID **`engineering-cad`** — mention
  `@engineering-cad` in a prompt, or ask a CAD task and let the model load
  it. (For a literal `/engineering-cad` menu entry, add the optional
  companion command file documented in `installer/npm/README.md` — skills
  never appear in the `/` menu on their own.)
- An installation left at an old, undiscovered location
  (`~/.opencode/skills/engineering_agent/`) is migrated automatically: the
  copy is validated first, files the old installer wrote and you never edited
  are brought up to date so the copy carries the current identity, your own
  edits and added files are kept exactly as they were and stay flagged as
  yours, and only then is the old directory offered for removal — a
  confirmation that defaults to **[y/N] = N**. Nothing else in those folders
  is ever touched.
- `update` shows the current and available versions, every file that changes,
  and any locally modified files — then asks for confirmation with the
  default **[y/N] = N**. It copies the installed skill to a backup directory
  outside the skills root before writing; `update --rollback` restores it.
- `doctor` is read-only and exits non-zero only when a check reports an
  error; it also reports the skill ID, whether the target is a documented
  discovery source, leftover old installs, and any `skill` permission rule
  that would hide the skill.
- Every command accepts `--dry-run`.

Exit codes: `0` success, `1` error, `2` aborted or confirmation required.
Live AutoCAD behavior is **not** claimed by the installer or its tests;
that remains Level 4 (PENDING) — see `docs/verification.md`.

## Live use — IMPLEMENTED (requires AutoCAD)

Start AutoCAD with a drawing open, then ask the agent to create, continue,
verify, and so on. Live validation status: see the test-level matrix in
`docs/verification.md` (Level 4 is PENDING).

## Uninstall — IMPLEMENTED (manual)

Remove the skill entry from `skills` in `opencode.json` (or delete the
installed folder — `~/.config/opencode/skills/engineering-cad/` for the
default install, `.opencode/skills/engineering-cad/` for `--local`) and, if
desired, the `mcp.servers.autocad-mcp` entry. Nothing else is modified — the
skill contains no installer that touches system state. `npx autocad-skill
doctor` prints the exact path it expects.
