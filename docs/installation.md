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

## Install via npx — PLANNED

Intended experience (not implemented in 0.1.0):

```
npx autocad-skill install
npx autocad-skill update
npx autocad-skill doctor
npx autocad-skill version
```

The package structure exists under `installer/npm/`; the commands are
interface stubs. See `installer/npm/README.md` for the specified behavior
(update confirmation, local-modification protection, configuration safety).

## Live use — IMPLEMENTED (requires AutoCAD)

Start AutoCAD with a drawing open, then ask the agent to create, continue,
verify, and so on. Live validation status: see the test-level matrix in
`docs/verification.md` (Level 4 is PENDING).

## Uninstall — IMPLEMENTED (manual)

Remove the skill entry from `skills` in `opencode.json` (or delete the
copied `.opencode/skills/engineering_agent/` folder) and, if desired, the
`mcp.servers.autocad-mcp` entry. Nothing else is modified — the skill
contains no installer that touches system state.
