# Workflow: INSPECT_PROJECT

## Entry Conditions
- User says "analyze this drawing", "describe the current state", "what's in the drawing?",
  "what have we done so far?", "show me what you see"
- Read-only inspection — nothing is modified

---

## Workflow Steps

### Step 1 — Connect

```
autocad_status
→ If ok: false → STOP: AutoCAD not connected
get_active_drawing_info
→ Record all fields
```

### Step 2 — Layer Survey

```
list_layers
→ Identify: layer count, names, colors, frozen/locked status
→ Infer project type from layer naming conventions
```

### Step 3 — Block Survey

```
list_blocks
→ Identify available blocks (non-layout, non-xref)
```

### Step 4 — Layout Survey

```
list_layouts
→ Identify model tab + paper space tabs
→ Note paper sizes if configured
```

### Step 5 — Entity Survey

For each meaningful layer:
```
query_entities (layer: [name])
→ Count entities by object_name type
→ Record in inspection report
```

If too many layers → prioritize layers with entities, skip empty ones.

Note: `max_scan` default is 5000. If `truncated: true` → report that the scan
was partial and the total_in_space value.

### Step 6 — Visual Overview

```
zoom_extents ()
capture_screenshot (width_px: 1400)
→ Check was_foreground == true in response data
```

Describe what is visible in the screenshot:
- What geometry types are present
- General spatial layout
- Any obvious anomalies (stray geometry, incomplete elements)

### Step 7 — Deliver Inspection Report

```
# Drawing Inspection Report

Drawing: [name]
Path: [path]
Units: [INSUNITS name]
[unit_warning if present]

## Layers
| Layer | Entities | Color | Status |
|-------|----------|-------|--------|
| [name] | [count] | [color] | [on/off/frozen] |

## Entity Summary
| Object Type | Count | Layers |
|------------|-------|--------|
| AcDbPolyline | N | WALLS-EXT, WALLS-INT |
| AcDbLine | N | ... |
| AcDbText | N | ... |

## Available Blocks
[list]

## Project State (if state file exists)
Current phase: [phase]
Last updated: [timestamp]
Status: [status]

## Observations
[visual description of what was seen in the screenshot]
[any anomalies noticed]

## Assessment
[Overall assessment: empty drawing / early stage / advanced / near-complete]
```

## Exit Conditions
- Inspection report delivered
- No modifications made to the drawing
