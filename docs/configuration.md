# Configuration

Status: **IMPLEMENTED** — all settings below exist in the current OpenCode
configuration formats and are in use on the reference setup. Nothing here is
invented; unknown fields are never added.

## Overview

The skill and the MCP server are wired through the project-local
`opencode.json`. This project never changes global OpenCode configuration.

```
opencode.json (project root)
├── skills    → where OpenCode finds the skill
└── mcp       → how OpenCode starts autocad-mcp
```

A placeholder-only template ships at the repository root as
`opencode.example.json`. The live configuration on the reference machine
differs only in machine-specific paths.

## Skill registration — IMPLEMENTED

```json
{
  "$schema": "https://opencode.ai/config.json",
  "skills": ["engineering_agent/skill"]
}
```

- Relative paths resolve **from the active OpenCode working directory**,
  not from the location of the config file.
- The source path points at the folder *containing* the skill directory.
  OpenCode derives the skill ID from the directory name at any depth below
  it — here the ID is `engineering_agent`.
- The array form shown above is the form documented by the OpenCode V2
  skills reference and the form verified working on the reference setup.
  The published config schema also describes an object form with `paths`
  and `urls` members; both are official, non-invented formats. Use one, not
  both, for the same entries.

## MCP server registration — IMPLEMENTED

```json
{
  "mcp": {
    "servers": {
      "autocad-mcp": {
        "type": "local",
        "command": ["<path-to-autocad-mcp>/.venv/Scripts/autocad-mcp.exe"],
        "cwd": "<path-to-autocad-mcp>",
        "environment": {
          "ACAD_MCP_OUTPUT_ROOT": "<directory-for-generated-drawings-and-project-memory>"
        }
      }
    }
  }
}
```

- `command`, `cwd`, `environment` are the supported local-server fields used
  by OpenCode; no extra fields are invented.
- `ACAD_MCP_OUTPUT_ROOT` is the root under which the skill writes project
  memory (`projects/…`), screenshots, and generated drawings. Set it to a
  writable directory you control.
- The venv entry point keeps Python dependencies isolated — no global
  Python installs.

## Configuration safety rules — IMPLEMENTED (enforced by the installer)

1. Read existing configuration before writing; never replace a user's
   `opencode.json` wholesale.
2. Preserve all unrelated keys exactly.
3. Add only the required skill/MCP entries.
4. Detect conflicts (duplicate skill IDs, existing entries) and report them.
5. Request explicit confirmation before any change that can alter agent
   behavior.

Manual changes follow the same rules by discipline; the `autocad-skill`
installer enforces them in code:

- The default install writes **no configuration at all** — the skill goes to
  the auto-discovered global skills folder
  (`~/.config/opencode/skills/engineering-cad/`, or
  `<project>/.opencode/skills/engineering-cad/` with `--local`), and an existing
  `opencode.json` stays byte-for-byte identical.
- No `permissions` entry is ever added or modified. OpenCode's default policy
  allows skills, so none is needed; `autocad-skill doctor` reports a `skill`
  rule that would `deny` the skill as an error, and one that would `ask` as a
  warning.
- `install --register` is the explicit opt-in: it confirms first, backs the
  config up to `opencode.json.autocad-skill-backup`, and appends exactly one
  path while preserving every other key.
- A `skills` value that is not an array, or a config file that cannot be
  parsed, is refused rather than rewritten.
- A `skills` entry that already provides this skill id is reported, and a
  second copy is only created after explicit confirmation.
- Migrating an installation out of an old location removes **only** that
  skill's own directory, and only after a confirmation that defaults to
  **[y/N] = N**. Sibling skills and parent directories are never touched.
- The `mcp.servers.autocad-mcp` block is never modified; the installer reads
  it and reports what it finds, nothing more.

## Troubleshooting

- Skill not listed: run `npx autocad-skill doctor` — it reports the skill ID,
  the expected install path, whether that path is one of OpenCode's documented
  discovery sources, any leftover copy at an old location, and any `skill`
  permission rule that would hide it. Expected: `engineering-cad`, loadable
  as `@engineering-cad` (skills do not appear in the `/` menu — that list
  shows commands, which live in `commands/` files, not skills).
- Wiring it by hand: check the `skills` path (working-directory-relative),
  that the folder contains `<skill-dir>/SKILL.md`, and that the file name is
  exactly `SKILL.md` with `name` and `description` in frontmatter. Remember
  the directory name sets the ID — copy it to `.opencode/skills/engineering-cad/`
  and mention `@engineering-cad` in a prompt to confirm it loads.
- MCP server not connected: verify the venv entry point exists and
  `ACAD_MCP_OUTPUT_ROOT` is writable; check OpenCode's MCP server log.
- Validator disagreements: run `python tests/validate_skill.py` — it
  compares the documentation against the real MCP schemas and reports the
  exact mismatch.
