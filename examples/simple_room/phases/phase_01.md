# Phase 01 — Room Boundary and Layer Setup

**Phase ID:** 01  
**Project:** simple_room  
**Goal:** Create drawing, set up layers, and draw the 6000×4000mm room boundary with pre-cut door opening.  
**Risk:** 🟢 GREEN  
**Status:** COMPLETE  

---

## Prerequisites

None — this is the first phase.

---

## Steps

| # | Description | Tool | Risk | Verification |
|---|-------------|------|------|-------------|
| 01 | Create and save new drawing | `create_new_drawing`, `save_drawing_as` | 🟢 | `get_active_drawing_info` |
| 02 | Create WALLS-EXT layer | `create_layer` | 🟢 | `list_layers` |
| 03 | Create DOORS layer | `create_layer` | 🟢 | `list_layers` |
| 04 | Create DIMENSIONS layer | `create_layer` | 🟢 | `list_layers` |
| 05 | Create _VERIFY_DIM layer | `create_layer` | 🟢 | `list_layers` |
| 06 | Set current layer to WALLS-EXT | `set_current_layer` | 🟢 | — |
| 07 | Draw West wall | `draw_line` | 🟢 | Handle recorded |
| 08 | Draw North wall | `draw_line` | 🟢 | Handle recorded |
| 09 | Draw East wall | `draw_line` | 🟢 | Handle recorded |
| 10 | Draw South wall (Left segment) | `draw_line` | 🟢 | Handle recorded |
| 11 | Draw South wall (Right segment) | `draw_line` | 🟢 | Handle recorded |

---

## Tool Call Details

### Step 01 — Drawing Initialization
```
create_new_drawing ()
save_drawing_as
  path: "simple_room/simple_room.dwg"
```

### Steps 02–05 — Layer Setup
```
create_layer (name: "WALLS-EXT",   color_aci: 7)
create_layer (name: "DOORS",       color_aci: 4)
create_layer (name: "DIMENSIONS",  color_aci: 2)
create_layer (name: "_VERIFY_DIM", color_aci: 8)
set_current_layer (name: "WALLS-EXT")
```

### Steps 07–11 — Wall Lines (with 900mm door opening at x=2550 to x=3450)
```
draw_line
  start_mm: [0, 0]
  end_mm: [0, 4000]
  layer: "WALLS-EXT"

draw_line
  start_mm: [0, 4000]
  end_mm: [6000, 4000]
  layer: "WALLS-EXT"

draw_line
  start_mm: [6000, 4000]
  end_mm: [6000, 0]
  layer: "WALLS-EXT"

draw_line
  start_mm: [0, 0]
  end_mm: [2550, 0]
  layer: "WALLS-EXT"

draw_line
  start_mm: [3450, 0]
  end_mm: [6000, 0]
  layer: "WALLS-EXT"
```

---

## Quality Gate

### 1. View & Visual Confirmation
```
zoom_extents ()
capture_screenshot (width_px: 1400)
→ Verify data["was_foreground"] == true
```

### 2. Dimensions to Verify (Sanity Checks)

*These dimensions are measured between agent-supplied points — they confirm
unit/measurement behavior only and are NOT independent proof of the wall
geometry. Primary evidence: the screenshot in section 1 + entity counts below.
The `erase_entity` calls below target agent-created `_VERIFY_DIM` artifacts
(verification-artifact exception in `rules/risk_rules.md`); the `dim_handle`s
of the agent's dimension entities must be recorded from each response.*

```
add_linear_dimension
  start_mm: [0, 4000]
  end_mm: [6000, 4000]
  dimension_line_point_mm: [3000, 4300]
  orientation: "horizontal"
  layer: "_VERIFY_DIM"
→ Verify measurement_mm == 6000.0 (±1mm)
→ erase_entity (dim_handle)

add_linear_dimension
  start_mm: [0, 0]
  end_mm: [0, 4000]
  dimension_line_point_mm: [-300, 2000]
  orientation: "vertical"
  layer: "_VERIFY_DIM"
→ Verify measurement_mm == 4000.0 (±1mm)
→ erase_entity (dim_handle)

add_linear_dimension
  start_mm: [2550, 0]
  end_mm: [3450, 0]
  dimension_line_point_mm: [3000, -300]
  orientation: "horizontal"
  layer: "_VERIFY_DIM"
→ Verify door gap measurement_mm == 900.0 (±1mm)
→ erase_entity (dim_handle)
```

### 3. Entity Counts
| Layer | Expected Count |
|-------|---------------|
| WALLS-EXT | 5 |

---

## Checkpoint & State Commit

After quality gate PASS:
```
save_drawing_as
  path: "checkpoints/simple_room_phase01.dwg"
  allow_overwrite: true
```
Commit all 5 wall handles to `project_state.md`. Mark Phase 01 as COMPLETE.
