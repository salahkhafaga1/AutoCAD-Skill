# Workflow: VERIFY_PROJECT

## Entry Conditions
- User says "verify", "check requirements", "does it match?", "run a quality check"
- OR triggered automatically by the agent at the end of a phase
- A drawing must be open with geometry to verify

---

## Core Rule

> Verification is independent confirmation, not trust in prior execution.
> Rely on primary evidence: handle/existence checks, layer/type/counts,
> screenshot inspection, and operation results. Dimensional checks are
> unit/measurement sanity checks — never claims of independent coordinate
> verification.

---

## Workflow Steps

### Step 1 — Connect and Load Requirements

```
autocad_status
get_active_drawing_info
```

Load `project_spec.md` to get the requirements list.
Load `project_state.md` to get the handle registry and current phase.

If neither file exists → enter INSPECT_PROJECT mode first.

### Step 2 — Define Verification Scope

Determine what to verify:
- If called at end of a phase → verify all items in that phase's completion criteria
- If called explicitly by user → verify all requirements in project_spec.md
- If called for a specific element → verify only that element

### Step 3 — Visual Overview

```
zoom_extents ()
capture_screenshot (width_px: 1400)
→ Verify was_foreground == true in response data
```

Note the visual state before starting detailed checks.

### Step 4 — Entity Existence Checks (Primary Evidence)

For each expected element in the handle registry:
```
query_entities (layer: [expected layer], limit: 1000, max_scan: 5000)
→ Confirm the handle is present (or count matches expectation)
→ If truncated == true: snapshot incomplete — re-query before concluding
→ Record: PRESENT or MISSING
```
Together with Step 3's screenshot, this is the MVP's primary verification
evidence (existence, type, layer, counts, visual alignment).

### Step 5 — Dimensional Sanity Check (NOT Independent Geometry Verification)

The current MCP exposes no entity coordinates, so a dimension measured
between agent-supplied points cannot prove the entity's actual geometry.
Run this check only as a unit / AutoCAD measurement sanity check:

```
create_layer (name: "_VERIFY_DIM", color_aci: 8) — if not exists
set_current_layer (name: "_VERIFY_DIM")

add_linear_dimension
  start_mm: [reference point]
  end_mm: [element endpoint]
  dimension_line_point_mm: [offset]
  orientation: "aligned" (or "horizontal"/"vertical" as appropriate)
  layer: "_VERIFY_DIM"

→ Read: measurement_mm from response data
→ Compare: |measurement_mm - required_mm| ≤ 1mm → sanity check PASS
→ If |diff| > 1mm → FAIL → record discrepancy and STOP (mismatch is a
  failure signal even though a match would not prove geometry)

erase_entity (handle: [dim handle])  ← agent-created _VERIFY_DIM artifact,
                                       covered by the verification-artifact
                                       exception in rules/risk_rules.md
```

Build a results table (label these as sanity checks):

| REQ | Required | Measured (sanity) | Tolerance | Result |
|-----|---------|---------|----------|--------|
| REQ-001 | 6000mm | 6000mm | ±1mm | ✓ PASS (sanity) |
| REQ-002 | 4000mm | 3998mm | ±1mm | ✓ PASS (within tolerance) |
| REQ-003 | 900mm | 902mm | ±1mm | ✗ FAIL (2mm over) |

State clearly in the report: these measurements are computed from supplied
points and are not independent coordinate verification. Position/geometry
claims rest on handle/layer/type checks + screenshot inspection.

### Step 6 — Constraint Verification

Load `constraints.md`. For each constraint:

Evaluate whether the constraint is satisfied based on:
- Measured dimensions from Step 5
- Entity layer assignments from Step 4
- Visual layout from screenshot

Record: SATISFIED or VIOLATED for each constraint.

### Step 7 — Deliver Verification Report

```
# Verification Report
Project: [name]
Date: [timestamp]
Phase: [current phase]

## Verification Basis
Primary: handle/existence + layer/type/counts + screenshot inspection +
operation results. Dimensional figures below are sanity checks computed
from agent-supplied points — NOT independent coordinate verification
(the current MCP exposes no entity coordinates).

## Requirement Verification
| ID | Requirement | Measured | Result |
|----|-------------|---------|--------|
| REQ-001 | ... | ... | ✓ PASS |
| REQ-002 | ... | ... | ✗ FAIL |

## Constraint Status
| ID | Constraint | Status |
|----|-----------|--------|
| CON-001 | ... | ✓ SATISFIED |

## Entity Status
| Element | Expected | Found | Status |
|---------|---------|-------|--------|
| WALL-N-01 | Present | Present | ✓ OK |

## Visual Assessment
[description of screenshot]

## Overall Result
✓ VERIFICATION PASSED — [N]/[N] requirements met
— or —
✗ VERIFICATION FAILED — [N] requirements failed:
  - REQ-002: [description of failure]
  Action needed: [specific correction]
```

### Step 8 — Update State

Record verification results in `project_state.md`:
- Mark requirements as verified (or failed)
- Record verification timestamp

## Exit Conditions
- Verification report delivered
- State updated with results

## Failure Conditions
- Cannot find expected entities → report as MISSING
- Measurement significantly off → report FAIL with exact discrepancy
- Cannot access drawing → STOP
