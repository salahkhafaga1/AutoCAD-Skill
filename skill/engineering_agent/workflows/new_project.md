# Workflow: NEW_PROJECT

## Entry Conditions
- User requests creating something new ("create", "design", "draw", "build")
- No existing project state file for this drawing
- AutoCAD must be running with an active drawing OR user accepts that the agent will create one

## Required Inputs
- Project name (to name files and directories)
- At minimum: what to build (room, apartment, floor plan, etc.)
- All HIGH-priority requirements (gathered via requirement_rules.md)

---

## Workflow Steps

### Step 1 — Connect and Check

```
autocad_status
→ If ok: false → STOP: "AutoCAD is not connected. Please start AutoCAD and open or create a drawing."
→ If ok: true → continue

get_active_drawing_info
→ Record: path, INSUNITS, unit_warning
→ If unit_warning → note: "Drawing is unitless. Measurements may not be reliable. Proceeding with caution."
```

### Step 2 — Extract Requirements

Apply `rules/requirement_rules.md`:
- Extract all stated requirements
- Detect ambiguities
- Identify missing critical information
- If any HIGH-priority requirement is missing → STOP and ask

Do not proceed to Step 3 until all HIGH-priority requirements are resolved.

### Step 3 — Classify Complexity

Apply `rules/planning_rules.md` complexity table:
- SIMPLE → proceed directly to Step 5 (short plan)
- MODERATE+ → create full phase plan (Step 4 required)

### Step 4 — Plan and Get Approval (MODERATE and above)

Create phase files in `phases/` directory using `templates/phase.template.md`.
Present plan to user in the format from `rules/planning_rules.md`.

🔴 **Do not execute a single tool call until the user approves the plan.**

Wait for: "approve", "yes", "proceed", or equivalent.
If "modify" → revise plan → present again.
If "stop" → save plan files only, exit.

### Step 5 — Set Up Project Files

Create the project memory directory structure:
```
{ACAD_MCP_OUTPUT_ROOT}/projects/{project_name}/
```

Create from templates:
- `project_spec.md` — populate with extracted requirements
- `project_state.md` — set status = IN_PROGRESS, Phase 01 = IN_PROGRESS

### Step 6 — Set Up the Drawing

If a new drawing is needed:
```
1. create_new_drawing ()
   → Creates and activates a blank metric drawing in AutoCAD memory.

2. save_drawing_as (path: "{project_name}/{project_name}.dwg")
   → Saves the drawing under ACAD_MCP_OUTPUT_ROOT.
```

Set up standard layers per project type using `create_layer`. For a floor plan:
```
create_layer (name: "WALLS-EXT", color_aci: 7)
create_layer (name: "WALLS-INT", color_aci: 5)
create_layer (name: "DOORS", color_aci: 4)
create_layer (name: "WINDOWS", color_aci: 3)
create_layer (name: "DIMENSIONS", color_aci: 2)
create_layer (name: "_VERIFY_DIM", color_aci: 8)
```
*(Do NOT create any internal registry entities inside the user's DWG. Handle tracking is managed in project state memory via pre-operation snapshots and post-operation handle diffs.)*

### Step 7 — Execute Phase 01

Follow the `EXECUTE → OBSERVE → VERIFY` loop for each step using exact parameters from `tool_contracts.md`.

For each step:
1. Pre-execution handle snapshot (per `rules/duplicate_prevention.md`).
2. Classify risk (per `rules/risk_rules.md`).
3. If GREEN: execute using exact `_mm` parameter names.
4. If YELLOW: execute + verify before next step.
5. If RED: request explicit human approval → execute → verify.
6. Retain entity handles in working memory. (Full state files are committed upon phase quality gate pass.)

### Step 8 — Phase Quality Gate

Apply `rules/verification_rules.md` quality gate procedure.

- PASS → save_drawing_as checkpoint → update project_state.md → report to user
- FAIL → correction procedure → if still failing → STOP (BLOCKED)

### Step 9 — Report and Pause

After Phase 01 completes:

```
Phase 01 complete ✓

Completed:
  ✓ [element description + verification result]
  ✓ [element description + verification result]

Next: Phase 02 — [name]
  [brief description]
  Risk: [level]

→ Type "continue" to proceed to Phase 02.
→ Type "stop" to save and pause here.
```

### Step 10 — Continue or Pause

If user says continue → execute Phase 02 (returning to Step 7).
If user says stop → project_state.md is written with "Next Action" populated.
Session ends cleanly.

## Exit Conditions
- All phases complete and verified → project COMPLETE
- User pauses → project PAUSED with clear next action recorded
- Verification failure after 2 attempts → BLOCKED, waiting for user

## Failure Conditions
- AutoCAD disconnects mid-execution → save state, report, stop
- A required requirement cannot be determined → STOP and ask
- Quality gate fails twice → BLOCKED
