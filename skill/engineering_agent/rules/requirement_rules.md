# Requirement Extraction Rules

When the user provides a design request, the agent must extract and structure
requirements before any planning or execution begins.

---

## Step 1 — Extract All Stated Requirements

Read the user's request carefully. Identify every stated element:

- Dimensions (width, height, area, clearance)
- Elements (rooms, doors, walls, columns)
- Relationships (adjacent to, connected by, north of)
- Materials or types (exterior wall, lightweight partition)
- Quantities (3 bedrooms, 2 bathrooms)
- Performance criteria (minimum area, maximum span)

Write each requirement as:

```
REQ-NNN: [Element] [property] [value] [unit]
Source: [user / standard / regulation / default]
Priority: [HIGH / MEDIUM / LOW]
Verifiable: [Yes — how / No — why not]
```

---

## Step 2 — Identify Missing Critical Requirements

A requirement is **critical** if its absence blocks the agent from planning
or executing correctly.

### Always required for ANY project:
- [ ] What type of project is this? (residential, commercial, structural...)
- [ ] What are the overall site or bounding dimensions?
- [ ] What units does the user expect? (mm, m, feet — agent works in mm internally)
- [ ] Is there an existing DWG to start from or is this a new drawing?

### Required for room/floor plan projects:
- [ ] Room dimensions (width × depth, or total area with shape)
- [ ] Wall thickness (exterior and interior) — if not stated, use standard defaults and RECORD THE ASSUMPTION
- [ ] Ceiling height — if not stated for 2D plan, record as assumption
- [ ] Door and window positions (if specific placement required)
- [ ] Which walls are load-bearing (if structural decisions are needed)

### Required for multi-floor projects:
- [ ] Number of floors
- [ ] Floor-to-floor height
- [ ] Vertical circulation (stairs, lifts)
- [ ] Structural system

---

## Step 3 — Identify Ambiguous Requirements

An ambiguous requirement has multiple valid interpretations that lead to
different designs.

| Signal | Ambiguity Type | Agent Response |
|--------|---------------|---------------|
| "normal", "standard", "typical" | Unquantified descriptor | Ask for specific dimension or cite the standard |
| "near", "close to", "adjacent" | Spatial relationship without dimension | Ask for clearance dimension |
| "a few", "some", "several" | Unquantified quantity | Ask for exact count |
| "large", "small", "comfortable" | Relative size | Ask for m² or mm |
| Location not specified | Positional ambiguity | Ask: "Where on [wall/floor]? Distance from [reference]?" |
| "with a door" without wall specification | Reference ambiguity | Ask: "Which wall? Distance from corner?" |

---

## Step 4 — Normalize Requirements

Convert all requirements to the agent's internal format:

| User Input | Normalized |
|-----------|-----------|
| "6 meters wide" | `width_mm: 6000` |
| "3 by 4" (context: metres) | `width_mm: 3000, depth_mm: 4000` |
| "900mm door" | `door_width_mm: 900` |
| "standard ceiling height" | `ceiling_height_mm: 2700` (assumption, record it) |
| "15 square meters" | `area_sqmm: 15000000, shape: TBD` |
| "south wall" | `wall: south — requires room boundary to be established first` |

---

## Step 5 — Completeness Check

Before beginning planning, all of the following must be true:

- [ ] Every HIGH-priority requirement has a specific, measurable value
- [ ] Every element that will be drawn has a target layer assigned
- [ ] Site/bounding dimensions are known
- [ ] No ambiguity exists in the position of the first element to be drawn
- [ ] All MEDIUM-priority requirements are either resolved or recorded as assumptions with confidence

If any HIGH-priority requirement is unresolved: **STOP and ask.**
If MEDIUM-priority items are unresolved: record as assumptions, continue.

---

## Step 6 — Present Requirements for Confirmation (Complex Projects Only)

For projects classified as MODERATE or above, present the extracted
requirements to the user before planning:

```
I have extracted the following requirements from your request:

Requirements:
  REQ-001: Room width = 6000mm (HIGH) ✓
  REQ-002: Room depth = 4000mm (HIGH) ✓
  REQ-003: Door on south wall, width = 900mm (HIGH) ✓

Assumptions I will use:
  ASM-001: Wall thickness = 200mm exterior, 100mm interior [MEDIUM confidence]
  ASM-002: Layer names: WALLS-EXT, WALLS-INT, DOORS [standard]

Missing (needs your input before I can begin):
  1. Where on the south wall should the door be placed?
     (distance from west corner, or centered?)

Do you confirm the requirements above and can you answer the missing item?
```

---

## Defaults (Record as Assumptions When Used)

| Property | Default Value | Assumption Confidence |
|----------|-------------|----------------------|
| Exterior wall thickness | 200mm | MEDIUM |
| Interior partition thickness | 100mm | MEDIUM |
| Standard door width | 900mm | HIGH (most common) |
| Standard door height | 2100mm | HIGH |
| Residential ceiling height | 2700mm | MEDIUM |
| Door clearance (swing) | 900mm minimum | HIGH |
| Corridor minimum width | 900mm | HIGH (accessibility minimum) |
| Dimension text height | 250mm | LOW (visual only) |

Using a default does NOT eliminate the need to record and verify it.
