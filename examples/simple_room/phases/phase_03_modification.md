# Phase 03 — Door Modification (Move Door 500mm Right)

**Phase ID:** 03  
**Project:** simple_room  
**Goal:** Relocate door D01 500mm to the right along the south wall (from x=2550 to x=3050) while maintaining 900mm clear opening.  
**Risk:** 🟡 YELLOW / 🔴 RED (involves entity replacement and displacement)  
**Status:** NOT_STARTED  

---

## Prerequisites

- Phase 02 must be COMPLETE and verified.
- Target door entities and south wall jamb segments must exist in `project_state.md`.

---

## Modification Specification

- **Current Door Hinge:** [2550, 0]
- **Target Door Hinge:** [3050, 0] (displacement: $\Delta x = +500\text{ mm}$, $\Delta y = 0$)
- **Current Opening:** x = 2550 to 3450
- **Target Opening:** x = 3050 to 3950
- **Left Jamb Segment (`WALL-S-L`):** [0, 0] $\to$ [3050, 0] (extended from 2550mm)
- **Right Jamb Segment (`WALL-S-R`):** [3950, 0] $\to$ [6000, 0] (shortened from 2550mm to 2050mm)

---

## Execution Workflow

### Step 1 — INSPECT: Locate Target Entities
Retrieve handles from `project_state.md` and verify presence via `query_entities`:
```
query_entities (layer: "DOORS", limit: 1000, max_scan: 5000)
→ Locate handle for DOOR-ARC and DOOR-PANEL
→ If truncated == true: snapshot incomplete — re-query before relying on it

query_entities (layer: "WALLS-EXT", limit: 1000, max_scan: 5000)
→ Locate handle for WALL-S-L and WALL-S-R
→ If truncated == true: snapshot incomplete — re-query before relying on it
```

### Step 2 — STATE SYNC: Pre-Modification State Check

Before touching geometry, confirm the state can be trusted:

**Primary evidence (handle / existence / layer checks):**
```
query_entities (layer: "WALLS-EXT", limit: 1000, max_scan: 5000)
→ Confirm WALL-S-L and WALL-S-R handles are present in the results
→ If truncated == true: snapshot is incomplete — do not conclude anything

query_entities (layer: "DOORS", limit: 1000, max_scan: 5000)
→ Confirm DOOR-ARC (and DOOR-PANEL) handles present
```
- Any required handle missing → stale state → **STOP** and re-analyze.
- Entity counts must match the State Sync Record (WALLS-EXT: 5, DOORS: 1).
- `zoom_extents ()` + `capture_screenshot (width_px: 1400)` → visually confirm
  the door opening is where state says it is.

**Measurement sanity check (optional — NOT independent geometry verification):**
```
create_layer (name: "_VERIFY_DIM", color_aci: 8)

add_linear_dimension
  start_mm: [0, 0]
  end_mm: [2550, 0]
  dimension_line_point_mm: [1275, -250]
  orientation: "horizontal"
  layer: "_VERIFY_DIM"
```
- Read `measurement_mm`. This dimension is measured between **agent-supplied
  points** — it checks unit conversion / AutoCAD measurement behavior, but it
  does **not** independently prove the jamb's actual endpoint.
- **Guard Check:** If `measurement_mm != 2550.0` (tolerance $\pm 1\text{ mm}$):
  → **STOP!** Measurement sanity failure — state cannot be trusted. Do NOT apply displacement.
- Cleanup: `erase_entity(handle: datum_dim_handle)` — this is an
  agent-created temporary artifact on `_VERIFY_DIM` (verification-artifact
  exception in `rules/risk_rules.md`; no separate approval required).

### Step 3 — CHECKPOINT: Save State Backup
🔴 Before performing any mutating operations:
```
save_drawing_as
  path: "checkpoints/simple_room_pre_door_move.dwg"
  allow_overwrite: true
```

### Step 4 — MODIFY: Execute Relocation
Displace door entities by +500mm using exact parameters from `tool_contracts.md`:
```
move_entity
  handle: "<DOOR-ARC_handle>"
  from_mm: [2550, 0]
  to_mm: [3050, 0]

move_entity
  handle: "<DOOR-PANEL_handle>"
  from_mm: [2550, 0]
  to_mm: [3050, 0]
```

Adjust wall jambs to match the new opening.

🔴 **RED — explicit approval required:** `WALL-S-L` and `WALL-S-R` are
project-authored wall geometry, **not** verification artifacts — the
`_VERIFY_DIM` erase exception does not apply. Present the RED approval message
per `rules/risk_rules.md` (handles, layers, what will be erased, checkpoint
path) and wait for an explicit "approve" before executing:

```
erase_entity (handle: "<WALL-S-L_handle>")
draw_line
  start_mm: [0, 0]
  end_mm: [3050, 0]
  layer: "WALLS-EXT"

erase_entity (handle: "<WALL-S-R_handle>")
draw_line
  start_mm: [3950, 0]
  end_mm: [6000, 0]
  layer: "WALLS-EXT"
```

### Step 5 — VERIFY: Quality Gate
Measure new positions and clearances using `add_linear_dimension`:

1. **Verify New Hinge Position:**
```
add_linear_dimension
  start_mm: [0, 0]
  end_mm: [3050, 0]
  dimension_line_point_mm: [1525, -250]
  orientation: "horizontal"
  layer: "_VERIFY_DIM"
→ Verify measurement_mm == 3050.0 (±1mm)
→ erase_entity (dim_handle)
```

2. **Verify Door Opening Width:**
```
add_linear_dimension
  start_mm: [3050, 0]
  end_mm: [3950, 0]
  dimension_line_point_mm: [3500, -250]
  orientation: "horizontal"
  layer: "_VERIFY_DIM"
→ Verify measurement_mm == 900.0 (±1mm)
→ erase_entity (dim_handle)
```

3. **Verify Remaining Right Clearance:**
```
add_linear_dimension
  start_mm: [3950, 0]
  end_mm: [6000, 0]
  dimension_line_point_mm: [4975, -250]
  orientation: "horizontal"
  layer: "_VERIFY_DIM"
→ Verify measurement_mm == 2050.0 (±1mm)
→ erase_entity (dim_handle)
```

4. **Visual Review:**
```
zoom_extents ()
capture_screenshot (width_px: 1400)
→ Verify data["was_foreground"] == true
```

### Step 6 — UPDATE STATE: Commit Modifications
- Update Handle Registry in `project_state.md` with new `WALL-S-L` and `WALL-S-R` handles.
- Record relocation in `change_log.md` (`CHG-001: Moved door D01 +500mm X`).
- Record updated intent in `decisions.md` (`DEC-003`).
- Save drawing in place:
```
save_active_drawing ()
```
Mark Phase 03 as COMPLETE.
