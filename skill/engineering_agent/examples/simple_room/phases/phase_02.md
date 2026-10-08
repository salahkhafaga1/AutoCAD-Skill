# Phase 02 — Door and Dimensions

**Phase ID:** 02  
**Project:** simple_room  
**Goal:** Add door symbol on south wall and annotate all room dimensions.  
**Risk:** 🟡 YELLOW  
**Status:** IN_PROGRESS  

---

## Prerequisites

- Phase 01 must be COMPLETE and quality gate must PASS
- Wall segments must exist with correct handles in `project_state.md`
- Door opening must exist at x=2550 to x=3450 on south wall (y=0)

---

## Door Position Reference

- South wall gap: x=2550 to x=3450 (900mm opening centered in 6000mm room)
- Door hinge: at [2550, 0] (left jamb, hinged to left)
- Door swing: 90° arc from [2550, 0], radius 900mm, swinging INTO the room (northward)

---

## Steps

| # | Description | Tool | Risk | Verification |
|---|-------------|------|------|-------------|
| 01 | Draw door swing arc | `draw_arc` | 🟡 | `query_entities` on DOORS layer |
| 02 | Draw door panel line | `draw_line` | 🟡 | Handle recorded |
| 03 | Add room width dimension | `add_linear_dimension` | 🟢 | `measurement_mm` == 6000 |
| 04 | Add room depth dimension | `add_linear_dimension` | 🟢 | `measurement_mm` == 4000 |
| 05 | Add door width dimension | `add_linear_dimension` | 🟢 | `measurement_mm` == 900 |
| 06 | Visual inspection | `zoom_extents`, `capture_screenshot` | 🟢 | `was_foreground` == true |

---

## Tool Call Details

### Step 01 — Door Swing Arc
```
draw_arc
  center_mm: [2550, 0]
  radius_mm: 900
  start_angle_deg: 0
  end_angle_deg: 90
  layer: "DOORS"
```

### Step 02 — Door Panel Line (Open Position)
```
draw_line
  start_mm: [2550, 0]
  end_mm: [2550, 900]
  layer: "DOORS"
```

### Step 03 — Room Width Dimension (Permanent)
```
add_linear_dimension
  start_mm: [0, 4000]
  end_mm: [6000, 4000]
  dimension_line_point_mm: [3000, 4400]
  orientation: "horizontal"
  layer: "DIMENSIONS"
```
Expected `measurement_mm`: 6000.0

### Step 04 — Room Depth Dimension (Permanent)
```
add_linear_dimension
  start_mm: [6000, 0]
  end_mm: [6000, 4000]
  dimension_line_point_mm: [6400, 2000]
  orientation: "vertical"
  layer: "DIMENSIONS"
```
Expected `measurement_mm`: 4000.0

### Step 05 — Door Width Dimension (Verification Dimension)
```
add_linear_dimension
  start_mm: [2550, 0]
  end_mm: [3450, 0]
  dimension_line_point_mm: [3000, -300]
  orientation: "horizontal"
  layer: "_VERIFY_DIM"
```
Expected `measurement_mm`: 900.0  
After reading: `erase_entity(handle: door_verify_dim_handle)`

### Step 06 — Visual Confirmation
```
zoom_extents ()
capture_screenshot (width_px: 1400)
→ Verify data["was_foreground"] == true
```

---

## Quality Gate

### Dimensions to Verify (Sanity Checks — see `rules/verification_rules.md`)

*Measured between agent-supplied points; a pass confirms unit/measurement
behavior, not entity coordinates. Primary evidence for this phase: handle/
existence + layer/type checks (Entity Counts below) + Step 06 screenshot.*

| Description | Expected | Tolerance |
|------------|---------|----------|
| Room width | 6000mm | ±1mm |
| Room depth | 4000mm | ±1mm |
| Door opening width | 900mm | ±1mm |
| Left jamb clearance | 2550mm | ±1mm |
| Right jamb clearance | 2550mm | ±1mm |

### Entity Counts
| Layer | Expected Count |
|-------|---------------|
| WALLS-EXT | 5 |
| DOORS | 2 (arc + panel line) |
| DIMENSIONS | 2 (width + depth) |

---

## Checkpoint & State Commit

```
save_drawing_as
  path: "checkpoints/simple_room_phase02_complete.dwg"
  allow_overwrite: true
```
Commit `DOOR-ARC`, `DOOR-PANEL`, `DIM-WIDTH`, `DIM-DEPTH` handles to `project_state.md`. Mark Phase 02 as COMPLETE.
