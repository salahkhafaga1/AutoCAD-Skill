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
   skill ID (`engineering_agent`) from that directory name at any depth under
   the source path.

   Alternative (project `.opencode` folder): copy the
   `skill/engineering_agent/` folder to
   `.opencode/skills/engineering_agent/` — discovered automatically.

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

## Install via npx — IMPLEMENTED (installer 0.2.0)

```
npx autocad-skill install
npx autocad-skill update
npx autocad-skill doctor
npx autocad-skill version
```

The package lives in `installer/npm/` and is published as `autocad-skill`.
Its behavior is documented in `installer/npm/README.md`; the important points:

- The default install copies the skill to `.opencode/skills/engineering_agent/`,
  the location OpenCode discovers automatically, so it changes **no**
  configuration. An existing `opencode.json` stays byte-for-byte identical;
  `--register` is the explicit opt-in that confirms first, backs the config
  up, and appends one path.
- `update` shows the current and available versions, every file that changes,
  and any locally modified files — then asks for confirmation with the
  default **[y/N] = N**. It copies the installed skill to a backup directory
  outside the skills root before writing; `update --rollback` restores it.
- `doctor` is read-only and exits non-zero only when a check reports an
  error.
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
copied `.opencode/skills/engineering_agent/` folder) and, if desired, the
`mcp.servers.autocad-mcp` entry. Nothing else is modified — the skill
contains no installer that touches system state.
