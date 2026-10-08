# Workflow: MODIFY_PROJECT

## Entry Conditions
- User requests a change to something that already exists
- Triggers: "move", "change", "update", "modify", "resize", "delete", "add to"
- A drawing is open with existing geometry

---

## Core Rules

1. **Understand before modifying.** Locate the element first.
2. **Analyze dependencies.** What does the target element connect to?
3. **Checkpoint before any destructive operation.**
4. **Verify after.** Modifications are only complete when verified.
5. **Update design intent.** A moved element's intent may change.

---

## Workflow Steps

### Step 1 — Connect and Load State

Same as CONTINUE_PROJECT Steps 1–3.

### Step 2 — Understand the Modification Request

Parse the request:
- **WHAT** is being changed? (element identity)
- **HOW** is it changing? (moved, resized, deleted, replaced)
- **BY HOW MUCH / TO WHERE?** (the specific change value)
- **WHY?** (if user states a reason, record it in change_log.md)

If any of these is ambiguous: **STOP and ask.**

Example:
```
"Move the door 500mm to the right"
→ WHAT: door (which door? if multiple)
→ HOW: moved
→ BY HOW MUCH: 500mm
→ DIRECTION: right (= +X direction)
→ WHY: not stated — record as "user request"
```

If "which door" is ambiguous and multiple doors exist:
→ zoom_extents + capture_screenshot → describe what's visible → ask user to identify

### Step 3 — Locate the Element

```
1. Check Handle Registry in project_state.md
   → If handle found: validate it with query_entities on the expected layer
     (query with limit: 1000, max_scan: 5000; confirm the handle appears
     in the returned entities and truncated == false)
   → If handle not found in that query: query_entities on expected layer → find by process of elimination

2. query_entities (layer: [expected layer], object_name: [expected type], limit: 1000, max_scan: 5000)
   → Verify the element is present (truncated == false for an authoritative result)
   → If multiple candidates: screenshot + describe → ask user to confirm
```

### Step 4 — Analyze Dependencies

Read the element's decision record in decisions.md:
- What other elements does this connect to?
- What constraints apply to this element?
- What will be affected by the change?

Dependency analysis for common modifications:

| Modification | Typical Dependencies |
|-------------|---------------------|
| Move door | Wall it's in, adjacent corridor, clearance constraints |
| Resize room | All walls, doors/windows in those walls, dimensions, room adjacencies |
| Move wall | Connected walls, doors/windows in that wall, room sizes |
| Delete entity | Every element that references this element's position |

Report dependencies to user before proceeding.

### Step 5 — Constraint Check

Before modifying, verify the modification doesn't violate any constraint:

Read `constraints.md` → find all constraints involving the target element.

For each relevant constraint:
- Will the modification violate it?
- Example: "Move door 500mm right" — will the new position maintain the 1200mm clearance constraint?

If a constraint would be violated:
→ **STOP**: "This modification would violate constraint CON-001: [description].
  The door needs [N]mm clearance on the right, but the modified position leaves only [M]mm.
  Options: [list alternatives]"

### Step 6 — Plan the Modification

Write out the specific tool calls needed:

```markdown
Modification Plan:
  1. save_drawing_as → checkpoint path (🔴 RED — execute first; allow_overwrite: true if updating)
  2. Pre-Execution State Check: handle existence + layer counts + screenshot
     (position cannot be numerically measured with the current MCP — see
     rules/state_sync_rules.md)
  3. move_entity
     handle: [handle]
     from_mm: [current position reference]
     to_mm: [new position reference]
  4. Verify: query_entities (handle/type/layer) + capture_screenshot
     (primary evidence), plus an optional add_linear_dimension sanity check
     from datum to expected new position (unit/measurement sanity only —
     NOT independent proof of position)
  5. Update Handle Registry (handle unchanged, but position reference updated)
  6. Update decisions.md: record why the element was moved
  7. Update change_log.md
```

Present plan to user if the modification is YELLOW or RED.

### Step 7 — Checkpoint

🔴 Before ANY mutating operation on existing geometry:

```
save_drawing_as
  path: "checkpoints/{project_name}_pre_{change_description}.dwg"
  allow_overwrite: true
```

Tell the user: "Checkpoint saved to [path]. Recovery from this point would
require manually reopening that file in AutoCAD."

### Step 8 — Pre-Execution State Check & Execution

1. **Pre-Execution State Check (Critical):**
   - Apply `rules/state_sync_rules.md` datum check: handle existence +
     layer/count check + screenshot inspection against `project_state.md`.
   - The current MCP cannot numerically measure an entity's position; if the
     available evidence cannot confirm the expected state (handle missing,
     counts wrong, snapshot truncated) → **STOP!** Stale state cannot be
     ruled out; do not apply the old displacement.
   - Optional `add_linear_dimension` sanity check may be run for units/
     measurement confidence — a match is NOT proof of position; a mismatch
     is a failure signal → STOP.
2. Execute `move_entity(handle=..., from_mm=..., to_mm=...)`.
3. Observe response and verify `ok: true`.

### Step 9 — Verify

Apply verification per `rules/verification_rules.md`:
- Primary evidence: `query_entities` (handle still present, type, layer),
  `capture_screenshot(width_px: 1400)` with `was_foreground == true`, and a
  visual check that the element moved as intended.
- Optional sanity check: `add_linear_dimension(start_mm: ..., end_mm: ...,
  dimension_line_point_mm: ..., layer: "_VERIFY_DIM")` between agent-supplied
  points; read `measurement_mm` and erase the temporary dimension
  (agent-created `_VERIFY_DIM` artifact — exception applies). This confirms
  units/measurement behavior only — NOT the entity's actual position.
- Confirm constraints are still satisfied (to the extent the MCP evidence allows).
- Verify dependent elements still connect correctly.

### Step 10 — Update State

```
1. Update Handle Registry (position changed, handle may be same)
2. Record in decisions.md:
   - What changed
   - Why
   - New constraints/relationships
3. Record in change_log.md:
   - Timestamp
   - Old state
   - New state
   - Affected elements
4. Update project_state.md: Last Updated
5. save_active_drawing
```

### Step 11 — Report

```
Modification complete ✓

Changed: [element] [how it changed]
Previous: [old value]
New: [new value]
Verified: [primary evidence — handles/layer/screenshot, plus any sanity measurement]
Checkpoint: [path]

Dependencies updated: [list any dependent elements that were also updated]
Constraints: [all satisfied / constraint X now needs attention]
```

## Exit Conditions
- Modification complete and verified → report delivered
- User cancels → drawing restored from checkpoint (manual, by user)

## Failure Conditions
- Element not found → STOP, ask user to identify
- Constraint violation → STOP, present options
- Verification failure → correction attempt → if still failing → STOP (BLOCKED)
