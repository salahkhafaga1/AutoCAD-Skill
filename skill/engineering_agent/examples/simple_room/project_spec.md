# Project Specification: Simple Room MVP

**Project Name:** simple_room  
**Type:** residential  
**Status:** IN_PROGRESS  
**Created:** 2026-10-06T00:00:00Z  
**Last Updated:** 2026-10-06T00:00:00Z  

---

## Drawing

**DWG Path:** `simple_room/simple_room.dwg`  
**INSUNITS:** 4 (millimetres)  
**Template Used:** acadiso.dwt  

---

## Requirements

| ID | Requirement | Source | Priority | Verified |
|----|-------------|--------|----------|---------|
| REQ-001 | Room width = 6000mm (interior clear) | user | HIGH | [ ] |
| REQ-002 | Room depth = 4000mm (interior clear) | user | HIGH | [ ] |
| REQ-003 | One door on south wall, width = 900mm | user | HIGH | [ ] |
| REQ-004 | Door position: centered on south wall | user | HIGH | [ ] |
| REQ-005 | All dimensions annotated | user | MEDIUM | [ ] |

---

## Assumptions

| ID | Assumption | Source | Confidence |
|----|-----------|--------|-----------|
| ASM-001 | Walls drawn as 5 discrete line segments (no wall thickness — 2D schematic) | default | HIGH |
| ASM-002 | Door represented as opening gap + arc symbol | default | HIGH |
| ASM-003 | Layer names: WALLS-EXT, DOORS, DIMENSIONS, _VERIFY_DIM | default | HIGH |

---

## Scope

### Included
- Four-wall room boundary (five discrete line segments — West, North, East, and the two South jamb segments; see DEC-001)
- One door with 900mm opening and swing arc
- Full room dimensions (width + depth)
- Door location dimension

### Explicitly Excluded
- Wall thickness / construction detail
- Interior furnishings
- Windows
- Paper space / title block

---

## Complexity Estimate

**Level:** SIMPLE  
**Estimated Phases:** 2  
**Estimated Tool Calls:** ~18  
**Reason:** Single room, 2 element types, no dependencies between phases  

---

## Acceptance Criteria

This project passes when:
1. `add_linear_dimension` on room width returns 6000mm ± 1mm
2. `add_linear_dimension` on room depth returns 4000mm ± 1mm
3. `add_linear_dimension` on door opening returns 900mm ± 1mm
4. Door is centered: left gap = right gap = (6000 - 900) / 2 = 2550mm
5. Screenshot shows closed rectangle with door opening on bottom wall
6. Project state file records all handles with correct element IDs
