# Project State

**Project Name:** [Name]  
**Last Updated:** [YYYY-MM-DDTHH:MM:SSZ]  
**Agent Session:** [session identifier or timestamp]  

---

## Current Mode

`[NEW_PROJECT / CONTINUE_PROJECT / MODIFY_PROJECT / INSPECT_PROJECT / VERIFY_PROJECT / PLAN_ONLY / RECOVER_PROJECT]`

---

## Phase Progress

**Current Phase:** `[phase_NN_name]`  
**Phase Status:** `[NOT_STARTED / IN_PROGRESS / BLOCKED / COMPLETE / FAILED]`  
**Current Step:** [step N of M — description of the step in progress]  

### Completed Phases

| Phase | Name | Status | Verified | Completed At |
|-------|------|--------|---------|-------------|
| 01 | [phase name] | [PASS / FAIL] | [Yes/No] | [timestamp] |

### Remaining Phases

| Phase | Name | Status | Dependencies |
|-------|------|--------|-------------|
| 02 | [phase name] | NOT_STARTED | Phase 01 |

---

## Handle Registry

Every entity created by the agent is tracked here.

| Element ID | Handle | Object Type | Description | Layer | Decision Ref |
|------------|--------|-------------|-------------|-------|-------------|
| WALL-N-01  | [hex]  | AcDbPolyline | North exterior wall | WALLS-EXT | DEC-001 |
| WALL-S-01  | [hex]  | AcDbPolyline | South exterior wall | WALLS-EXT | DEC-001 |

**Handle validation:** On every CONTINUE or MODIFY operation, verify **all**
handles in this registry (query the expected layers with `limit: 1000`,
`max_scan: 5000`, check `truncated == false`). If any required handle is
missing → stale state: STOP and re-analyze. If the query is truncated, do
not draw a definitive conclusion — obtain a complete snapshot first.

---

## Known Issues

| ID | Description | Blocking? | Resolution |
|----|-------------|-----------|-----------|
| ISSUE-001 | [description] | Yes/No | [pending / resolved] |

---

## Unresolved Assumptions

| ID | Assumption | Confidence | Needs Approval? |
|----|-----------|-----------|----------------|
| ASM-001 | [text] | HIGH/MEDIUM/LOW | Yes/No |

---

## Checkpoint History

| Version | Timestamp | DWG Path | Phase | Description |
|---------|-----------|----------|-------|-------------|
| v1.0 | [timestamp] | [path] | Phase 01 | Initial drawing saved |

---

## Next Action

**What to do next (for CONTINUE_PROJECT to pick up from here):**

```
[Description of the exact next step — specific enough that the agent can
execute it without re-reading the entire project spec.]

e.g.:
Continue Phase 02, Step 3: Draw south interior partition wall.
  draw_polyline from [1000, 2000] to [5000, 2000]
  layer: WALLS-INT
  Then verify: add_linear_dimension from [1000, 2000] to [5000, 2000]
  Expected measurement: 4000mm
```

---

## State Sync Record

Last entity count verified per layer:

| Layer | Expected Count | Last Checked | Status |
|-------|---------------|-------------|--------|
| WALLS-EXT | [N] | [timestamp] | [OK / MISMATCH] |
| DOORS | [N] | [timestamp] | [OK / MISMATCH] |
