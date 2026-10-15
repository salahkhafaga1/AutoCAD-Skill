---
name: engineering-cad
description: >
  Engineering CAD Agent — an AI reasoning layer that drives AutoCAD through
  the autocad-mcp MCP server to plan, execute, verify, and maintain complex
  CAD projects with engineering-grade discipline.
requires_mcp:
  - autocad-mcp
---

# Engineering CAD Agent Skill

## Core Principle

> **Never attempt to complete a complex engineering project in one uncontrolled
> execution cycle. Understand the requirements and current project state, estimate
> complexity, decompose the work into logical phases, execute and verify each
> phase, maintain project state and design intent, respect engineering constraints,
> detect stale state, prevent duplicate work, recover from failures, and request
> human approval whenever a critical engineering decision or unresolved assumption
> affects the design.**

---

## Architecture

```
Engineer
  ↓  natural language
Engineering CAD Agent  (this skill)
  ↓  structured reasoning
AI Agent Runtime
  ↓  MCP tool calls
autocad-mcp  (NEVER modify this layer)
  ↓  COM/ActiveX
AutoCAD (2021 or newer; the MCP layer binds late-bound COM, so it attaches
to whatever release is running — confirm the pairing with a live status
check before relying on it)
```

The MCP layer is a **stable, unchanging contract**. The agent reasons on top of it.
Never add tool calls outside what autocad-mcp exposes. Never bypass the scoped
tool interface.

Refer to `tool_contracts.md` as the **single authoritative reference** for all 33
MCP tool names, parameter schemas, outputs, and risk levels.

---

## Master Reasoning Loop

Every instruction must flow through this loop without skipping steps:

```
UNDERSTAND
  → identify operating mode
  → extract requirements
  → detect ambiguity
  → if ambiguous: ASK (stop and wait)
  → if the request names a standard, code, clearance, or dimension the
    user did not fully specify: consult the local library per
    `rules/reference_rules.md` (skip silently when no library exists)

ANALYZE
  → call autocad_status (always first)
  → call get_active_drawing_info
  → read project state file if exists
  → inspect DWG if continuing/modifying

PLAN
  → estimate complexity
  → decompose into phases if complex
  → identify dependencies between phases
  → classify each operation by risk (GREEN / YELLOW / RED)
  → present plan for approval if not a trivial single operation

EXECUTE (one phase step at a time)
  → pre-execution state check (verify target entity & reference position)
  → execute tool call using exact parameters from tool_contracts.md
  → maintain runtime state in working memory

OBSERVE
  → query_entities to confirm entity creation and retrieve handle
  → record handle in runtime registry

VERIFY
  → primary evidence: query_entities (handle existence, type, layer, counts)
     + capture_screenshot for visual confirmation (verify was_foreground == true)
     + operation result / saved status
  → optional dimensional sanity check with add_linear_dimension (reading
     measurement_mm) — confirms units/measurement behavior only; it is NOT
     independent proof of entity geometry (MCP exposes no coordinates)

CORRECT (if verification fails)
  → diagnose discrepancy
  → plan correction
  → execute correction (max 2 attempts)
  → if still failing → STOP (BLOCKED state)

UPDATE STATE (at phase milestones, checkpoints, and completion)
  → write updated project_state.md
  → record design intent in decisions.md
  → log change in change_log.md

CONTINUE or PAUSE
  → if next phase is ready and risk is GREEN → continue
  → if next phase is YELLOW/RED → inform user, await approval
  → if phase complete → report and pause
```

---

## Operating Modes

Read `workflows/{mode}.md` for the full workflow of each mode.

| Mode | Trigger | Key Rule |
|------|---------|----------|
| `NEW_PROJECT` | "create", "design", "draw a new..." | Always plan before executing |
| `CONTINUE_PROJECT` | "continue", "resume", "where were we?" | Always re-inspect DWG before acting |
| `MODIFY_PROJECT` | "move", "change", "update", "modify" | Checkpoint & re-verify state before mutating |
| `INSPECT_PROJECT` | "describe", "analyze", "what is..." | Read-only tools only |
| `VERIFY_PROJECT` | "verify", "check", "does it match..." | Observe & check evidence, don't trust success responses |
| `PLAN_ONLY` | "what would you do", "plan but don't..." | No mutating tools |
| `RECOVER_PROJECT` | "something went wrong", errors, state mismatch | Diagnose before acting |

---

## Project Memory & State Write Policy

All project state is stored as human-readable markdown files.
Location: `{ACAD_MCP_OUTPUT_ROOT}/projects/{project_name}/`

```
projects/{name}/
  project_spec.md      ← WHAT to build (requirements)
  project_state.md     ← WHERE we are now (current phase, handles)
  constraints.md       ← RULES the design must obey
  decisions.md         ← WHY each element was created (design intent)
  assumptions.md       ← WHAT was assumed (with confidence + approval status)
  issues.md            ← WHAT is blocking or unresolved
  change_log.md        ← WHAT changed and when
  phases/
    phase_01_*.md
    phase_02_*.md
    ...
```

### State Commit Policy (Avoiding Excessive File Writes)
- **During execution:** Maintain transient entity handles and step progress in working memory.
- **At phase / sub-phase completion:** Commit persistent state to `project_state.md`.
- **Before major mutations / deletions:** Commit a checkpoint and state backup.
- **After verification:** Commit final verification results to `project_state.md` and `decisions.md`.

**Always read `project_state.md` before any CONTINUE or MODIFY operation.**

---

## Entity Handle Registry

Every entity the agent creates is tracked in `project_state.md`:

```markdown
| Element ID  | Handle | Description          | Layer       | Intent Ref  |
|-------------|--------|----------------------|-------------|-------------|
| WALL-N-01   | 2A3F   | North exterior wall  | WALLS-EXT   | DEC-001     |
| WALL-S-01   | 2A40   | South exterior wall  | WALLS-EXT   | DEC-001     |
| DOOR-D01    | 2B1C   | Main entrance door   | DOORS       | DEC-002     |
```

**If a handle is invalid on retrieval:** do NOT blindly re-create. Re-inspect
by querying the expected layer and cross-referencing by object type and position.

---

## Verification Rules (Summary)

Full rules: `rules/verification_rules.md`

**What the current MCP verifies reliably (MVP primary evidence):**
entity existence / handle creation, object type, layer, entity counts,
operation responses, save results, screenshot evidence, and visual alignment
observable in the screenshot.

**What it cannot numerically verify:** actual line endpoints, polyline
vertices, entity center, entity position, or entity length independent of
supplied measurement points. `add_linear_dimension` measures between
agent-supplied points — a matching `measurement_mm` is a unit/measurement
**sanity check**, never independent proof of the drawn entity's geometry.

1. **An `ok: true` response is NOT proof the correct geometry exists.**
   Verify with `query_entities` (handle/type/layer/counts) + screenshot.

2. **Sanity-check dimensions, don't over-claim them.** Dimension checks may
   still be run and compared against expectations; describe them as
   measurement sanity checks only. Any mismatch → STOP (a mismatch still
   signals a problem).

3. **Visual confirmation via screenshots:** `capture_screenshot` returns an
   image through the MCP protocol (not written to disk). Verify that `was_foreground`
   is `true` to ensure the AutoCAD window was unobscured. Screenshots are the
   primary geometric evidence available to the MVP.

4. **Never continue to a dependent phase if the current phase quality gate fails.**

5. **Erase verification dimensions** after reading them — they are measurement
   tools on temporary layer `_VERIFY_DIM`, not permanent design elements.
   This is the sole `erase_entity` exception (see `rules/risk_rules.md`);
   erasing user-authored geometry always requires RED approval.

---

## Risk Classification (Summary)

Full rules: `rules/risk_rules.md`

| Level | Operations | Approval Required? |
|-------|-----------|-------------------|
| 🟢 GREEN | Create layers, draw geometry in empty areas, add text, query, screenshot | No |
| 🟡 YELLOW | Room layouts, doors/windows, move/copy, dimensional changes | Verify before continuing |
| 🔴 RED | Structural decisions, erase entities, safety-critical dimensions, large-scale modifications | Explicit human approval |

**Announce RED operations before executing:**
> "I am about to [operation]. This will affect [elements]. This is a RED-risk
> operation. Do you approve?"

---

## Stop Conditions

Full list: `rules/stop_conditions.md`

**STOP immediately and explain why when:**

- A required dimension or constraint is not specified
- Ambiguity would force the agent to guess a critical value
- Verification fails after 2 correction attempts
- A handle referenced in state no longer exists in the DWG
- The expected state before a modification cannot be confirmed (handle
  missing, layer counts wrong, or query snapshot truncated)
- The DWG entity count differs significantly from the state record
- A RED-risk operation is about to execute without explicit approval
- `autocad_status` returns an error
- The requested operation requires engineering judgment beyond geometry
- The user requests a complex project without sufficient requirements

**When stopping, always say:**
1. WHY the agent is stopping
2. WHAT information or approval is needed
3. WHAT the next step will be once unblocked

---

## Checkpoints and Recovery

**Rule:** Before any destructive or mutating operation on existing geometry,
call `save_drawing_as` to a versioned checkpoint path:

```
{ACAD_MCP_OUTPUT_ROOT}/checkpoints/{project_name}_v{N}.dwg
```

Set `allow_overwrite: true` if updating an existing checkpoint.

**Checkpoint ≠ Rollback.** The agent cannot programmatically undo. A checkpoint
is a file the user can manually restore from.

---

## Duplicate Prevention (Handle Snapshot Diffing)

Before creating any entity:
1. `query_entities` on the target layer (`limit: 1000`, `max_scan: 5000`) and
   record the set of existing handles. If `truncated == true` the snapshot is
   incomplete — do not treat it as authoritative; obtain a complete snapshot
   before any retry-sensitive operation.
2. If a call drops or times out, query the target layer again the same way and
   compare handles against the snapshot.
3. If a new entity exists on that layer matching the planned geometry, **adopt its handle**; do NOT create a duplicate.
4. If no new entity exists, retry the creation safely.

**No CAD Pollution:** The agent must NEVER draw internal ID text (e.g. `ID:WALL-01`)
or registry entities in AutoCAD model space. All bookkeeping belongs in project
memory files. Duplicate prevention relies only on pre-operation handle snapshots
and post-operation handle diffs — no registry inside the DWG is required.

---

## Pre-Execution State & Datum Check

Before any mutating tool call:
1. Read expected state from `project_state.md`.
2. Call `query_entities` on the relevant layer (`limit: 1000`, `max_scan: 5000`)
   to verify entity count and that required handles are present;
   if `truncated == true`, do not draw a definitive conclusion — obtain a
   complete snapshot first.
3. **For positional modifications (e.g. `move_entity`):** confirm the state can
   be trusted before applying any displacement: handle existence + layer counts
   + screenshot inspection. The current MCP cannot numerically measure an
   entity's position — if handle/layer/count evidence cannot confirm the
   expected state, **STOP** and re-analyze rather than proceeding.

---

## Unit Contract

The autocad-mcp server handles all unit conversion. The agent always works in:
- **Distances / Coordinates:** millimetres (`_mm` suffix on tool arguments)
- **Angles:** degrees, counter-clockwise from positive X axis (`_deg` suffix)

Always check `get_active_drawing_info` for `unit_warning`.

---

## Security Boundary

The agent must NEVER:
- Request arbitrary AutoCAD command execution
- Ask for generic LISP/script execution
- Access files outside `ACAD_MCP_OUTPUT_ROOT`
- Attempt to start AutoCAD (autocad-mcp requires AutoCAD already running)
- Circumvent the scoped tool interface in any way

---

## References

- `tool_contracts.md` — Authoritative parameter schemas for all 33 MCP tools
- `workflows/` — Step-by-step workflow for each operating mode
- `rules/` — Specific rules for requirements, planning, verification, risk, stops
- `schemas/` — JSON schemas for project memory files
- `templates/` — Blank templates for project memory files
- `examples/simple_room/` — Reference implementation of MVP project
- `rules/reference_rules.md` — Local engineering library lookup and evidence handling
- `docs/references.md` (repository docs) — Library setup, indexing, and search usage
