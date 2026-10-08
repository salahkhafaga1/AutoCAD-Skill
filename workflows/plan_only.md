# Workflow: PLAN_ONLY

## Entry Conditions
- User says "plan but don't execute", "what would you do?", "show me the plan",
  "how would you approach X?", "give me a plan for..."
- No drawing modification will occur

---

## Workflow Steps

### Step 1 — Connect (Read-Only)

```
autocad_status → check if AutoCAD is running (for context)
get_active_drawing_info → if a drawing is open, note its state
list_layers → if a drawing is open, note existing structure
```

These calls are informational only.

### Step 2 — Extract Requirements

Apply `rules/requirement_rules.md`.

Note ambiguities and missing information — but in PLAN_ONLY mode, reasonable
defaults and assumptions are acceptable as placeholders. Mark them clearly as
[ASSUMED] in the plan.

### Step 3 — Classify Complexity

Apply `rules/planning_rules.md` complexity classification.

### Step 4 — Decompose Into Phases

Create a complete phase plan. For each phase, define:
- Name and goal
- Prerequisites
- Estimated tool calls
- Risk level
- Completion criteria
- Quality gate

### Step 5 — Identify Decisions and Assumptions

List every:
- Decision that will need to be made
- Assumption that will be used
- RED-risk operation that will require approval

### Step 6 — Deliver Plan

```
# Project Plan: [Name]

## Summary
Complexity: [level]
Phases: [N]
Estimated total tool calls: [N]
Estimated session time: [rough estimate]

## Requirements Used
[List all requirements + assumptions]

## Phase Overview
Phase 01 — [name]
  Goal: [sentence]
  Steps: [N] tool calls
  Risk: 🟢 GREEN
  Completion: [criteria]

Phase 02 — [name]
  Goal: [sentence]
  Steps: [N] tool calls
  Risk: 🟡 YELLOW
  Completion: [criteria]
  Dependencies: Phase 01

Phase 03 — [name]
  Goal: [sentence]
  Steps: [N] tool calls
  Risk: 🔴 RED — [reason]
  Approval required before execution
  Dependencies: Phases 01, 02

## Open Questions
Before execution begins, these need answers:
  1. [question]
  2. [question]

## Approval Points
- Start of execution (Phase 01)
- Phase 03 entry (RED risk)
- Any erase operations

## To Execute This Plan
Type "begin" or "approve" and I will start with Phase 01.
To modify: tell me what to change and I will revise.
```

## Exit Conditions
- Plan delivered
- No drawing changes made

## Notes
PLAN_ONLY mode is also the safe way to explore a complex request before committing.
The agent can use this mode to gather requirements, clarify ambiguities, and
present an approach — without the user needing to worry about accidental changes.
