# Workflow: RECOVER_PROJECT

## Entry Conditions
- User says "something went wrong", "the drawing looks wrong", "I think there are duplicates"
- Agent detected a state mismatch during CONTINUE_PROJECT
- A previous session ended in an error state
- Handles in project_state.md are invalid
- Entity counts are significantly wrong

---

## Core Rule

> Diagnose before acting. Never delete or modify anything in recovery mode
> without explicit user approval.

---

## Workflow Steps

### Step 1 — Connect

```
autocad_status
→ If ok: false → STOP: "AutoCAD is not connected. Cannot recover."
get_active_drawing_info
→ Note drawing path, saved status
```

### Step 2 — Assess the Problem

Identify the type of problem:

```
a) Handle invalid?
   → query_entities on affected layers → compare to state records
   → Entity might have been deleted or moved to different layer

b) Wrong entity count?
   → query_entities on each layer → compare to expected counts
   → List discrepancies

c) Duplicate geometry?
   → query_entities → if count > expected → possible duplicates
   → zoom_extents + capture_screenshot → visual inspection

d) Drawing state unknown (no state file)?
   → Enter INSPECT mode first → reconstruct state
   → Present reconstruction → ask user to confirm before continuing

e) AutoCAD crash recovery?
   → Check if drawing has unsaved changes (get_active_drawing_info: saved=false)
   → If unsaved → save NOW before doing anything else
   → Then assess
```

### Step 3 — Document Current State

Take a complete snapshot:
```
zoom_extents ()
capture_screenshot (width_px: 1400)
→ The screenshot is returned as image content in the MCP response.
  It is NOT written to a file. Inspect the returned image directly.
```

For each layer:
```
query_entities (layer: [name], limit: 1000, max_scan: 5000)
→ Record actual count and entity types
→ If truncated == true: this snapshot is incomplete — re-query with a
  complete snapshot before drawing conclusions or retrying anything
```

Build a discrepancy table:
```
| Layer | Expected | Actual | Discrepancy |
|-------|---------|--------|------------|
| WALLS-EXT | 4 | 4 | OK |
| DOORS | 1 | 2 | +1 EXTRA |
```

### Step 4 — Present Findings to User

```
# Recovery Assessment

Issue detected: [description]

Visual snapshot: [describe the screenshot image returned by capture_screenshot]

Discrepancies found:
  [table from Step 3]

Invalid handles:
  DOOR-D01: handle 2B1C → NOT FOUND in drawing
  [list]

My assessment:
  [Likely cause based on evidence]
  [What state the drawing appears to be in]

Proposed recovery options:
  Option A: [description — e.g., "Accept current drawing, rebuild state records"]
  Option B: [description — e.g., "Restore from checkpoint {path} (requires manual file operation)"]
  Option C: [description — e.g., "Remove duplicate on DOORS layer (handle: [X])"]

Which option do you prefer?
```

Do not proceed without user response.

### Step 5 — Execute Recovery (User-Approved Only)

If user approves Option A (rebuild state):
→ Reconstruct project_state.md from current DWG
→ Update handle registry by querying and re-mapping
→ Save new state file
→ Present new state to user for confirmation

If user approves Option B (restore checkpoint):
→ Inform user this requires manual action:
  "Please open [checkpoint path] in AutoCAD and make it the active document.
   Then tell me to continue."
→ Wait for user confirmation that correct file is open
→ Re-sync state

If user approves Option C (remove duplicates):
→ checkpoint first: save_drawing_as to recovery_backup
→ 🔴 Request final approval before erase:
  "I will erase entity with handle [X] (layer: [L], type: [T]).
   This cannot be undone programmatically. Approve?"
→ On approval: erase_entity
→ Verify layer count is now correct
→ Update state

### Step 6 — Verify Recovery

After any recovery operation:
```
query_entities on all affected layers
→ Confirm counts now match expected
capture_screenshot
→ Visual confirmation
```

### Step 7 — Resume

If recovery is successful:
```
Recovery complete ✓

Drawing is now in a known state:
[updated discrepancy table — all OK]

State file has been updated.

→ Type "continue" to resume the project from [current phase/step].
→ Type "inspect" to review the drawing before continuing.
```

## Exit Conditions
- Recovery successful → state consistent, user can continue
- User chooses not to recover → drawing left as-is, state marked REQUIRES_RECOVERY

## Failure Conditions
- Cannot determine what went wrong → present raw evidence, ask user for guidance
- Recovery makes things worse → restore from backup, stop
- User cannot identify which entities to keep → stop, require manual intervention
