# Architecture

Status of this document: **IMPLEMENTED** — describes the structure that
exists in this repository as of v0.1.0.

## Layers

```
Engineer
  ↓  natural language
Engineering CAD Agent Skill      ← this repository (reasoning & workflow layer)
  ↓  structured plan & MCP tool calls
OpenCode Agent Runtime           ← host that loads the skill and the MCP server
  ↓  MCP tool calls
autocad-mcp                      ← separate repository (AutoCAD integration layer)
  ↓  COM / ActiveX
AutoCAD
```

## Responsibilities

### Engineering CAD Agent Skill (this repository)

- Requirement understanding and ambiguity detection
- Engineering reasoning and design intent
- Project analysis and complexity assessment
- Planning and decomposition into phases
- Execution workflow (one phase step at a time)
- Observation of operation results
- Verification and phase quality gates
- Recovery from failures and state mismatches
- Project state management (project memory files)
- Decisions, assumptions, and constraints tracking
- Risk management and human-approval gating
- Continuation of unfinished projects
- Change management (versioning, changelog, updates)

### autocad-mcp (separate repository, never modified here)

- AutoCAD integration and communication
- Low-level CAD operations exposed as MCP tools
- Session, document, layer, entity, geometry, dimension, and screenshot tools

### Hard rules

1. **Engineering reasoning never moves into autocad-mcp.** The MCP layer is a
   tool layer; intelligence about what to build, in what order, and whether
   it is safe stays in this skill.
2. **autocad-mcp is never modified, bundled, or forked** by this project.
   The dependency is one-way: the skill expects a compatible autocad-mcp
   checkout (see `docs/installation.md`).
3. **The skill adapts to the actual MCP interface**, never to an idealized
   one. `tool_contracts.md` documents the real tools and is re-validated
   against the server before any contract change (see `docs/development.md`).

## Skill layer structure

`skill/engineering_agent/` is the portable skill unit (everything an
OpenCode installation needs):

| Part | Role |
|------|------|
| `SKILL.md` | Entry point: identity, master reasoning loop, workflow modes, risk model, verification policy, state management, safety rules |
| `workflows/` | One workflow per project intent: NEW, CONTINUE, MODIFY, INSPECT, VERIFY, PLAN_ONLY, RECOVER |
| `rules/` | Reusable behavior constraints shared across workflows (requirements, planning, verification, risk, duplicate prevention, state sync, stop conditions) |
| `schemas/` | JSON schemas for the project memory files |
| `templates/` | Blank project memory templates |
| `examples/` | Worked example project |
| `tool_contracts.md` | Documentation of the real autocad-mcp interface |
| `skill.json` | Version manifest (identity, version, tool-contract version) |

Shared logic lives in `rules/`; workflows reference rules instead of
duplicating them. Project-specific content never lives in global rules.

## Master reasoning loop

```
Understand → Analyze → Plan → Execute → Observe → Verify → Correct
           → Update State → Continue
```

Defined in `SKILL.md`; not replaced by any workflow — each workflow is a
 specialization of this loop.

## State / memory model

State lives as human-readable markdown under
`{ACAD_MCP_OUTPUT_ROOT}/projects/{name}/`: `project_spec.md`,
`project_state.md`, `constraints.md`, `decisions.md`, `assumptions.md`,
`issues.md`, `change_log.md`, `phases/`. This lets the agent answer what the
project is, what is done and verified, what remains, the current phase and
next action, which assumptions and decisions exist, which constraints apply,
what problems occurred, and what changed — and supports NEW, CONTINUE,
MODIFY, and RECOVER without restarting a project.

## Distribution chain (target evolution)

```
GitHub (versioned source)
  → npm / npx installer (distribution & update layer — IMPLEMENTED)
    → OpenCode (runtime, discovers skill via `skills` config)
      → autocad-mcp (external dependency)
        → AutoCAD
```

The installer distributes and updates; the skill reasons; autocad-mcp
integrates. These responsibilities stay separated.
