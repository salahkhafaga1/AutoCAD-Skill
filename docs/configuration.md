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

## Configuration safety rules — policy (installer enforcement PLANNED)

1. Read existing configuration before writing; never replace a user's
   `opencode.json` wholesale.
2. Preserve all unrelated keys exactly.
3. Add only the required skill/MCP entries.
4. Detect conflicts (duplicate skill IDs, existing entries) and report them.
5. Request explicit confirmation before any change that can alter agent
   behavior.

Manual changes today follow the same rules by discipline; the
`installer/npm` layer will enforce them when implemented (PLANNED).

## Troubleshooting

- Skill not listed: check the `skills` path (working-directory-relative),
  that the folder contains `engineering_agent/SKILL.md`, and that the file
  name is exactly `SKILL.md` with `name` and `description` in frontmatter.
- MCP server not connected: verify the venv entry point exists and
  `ACAD_MCP_OUTPUT_ROOT` is writable; check OpenCode's MCP server log.
- Validator disagreements: run `python tests/validate_skill.py` — it
  compares the documentation against the real MCP schemas and reports the
  exact mismatch.
