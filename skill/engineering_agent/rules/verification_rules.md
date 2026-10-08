# Verification Rules

The agent verifies all work. A tool returning `ok: true` is **not** verification.
Verification requires independently observing or checking the result — by
screenshot inspection, handle/existence queries, layer/type/count checks, and
(where available) measurement sanity checks.

---

## Core Principle

> "A successful tool call proves that the API accepted the command.
> It does NOT prove that the correct geometry exists at the correct position
> with the correct dimensions."

The agent must always close the loop:
**Execute → Observe → Compare → Pass or Fail**

---

## What the Current MCP Can and Cannot Verify (MVP)

The MCP server does NOT expose entity coordinates/vertices. No tool returns
line endpoints, polyline vertices, or entity centers. This bounds what
verification can honestly claim.

### Verified reliably (primary evidence for MVP)

| Evidence | MCP Tool |
|----------|----------|
| Entity existence / handle creation | `query_entities` (handle appears in results) |
| Object type | `query_entities` (`object_name`) |
| Layer assignment | `query_entities` (`layer`) |
| Entity counts | `query_entities` (`total_in_space`, count vs. State Sync Record) |
| Operation response | tool response `ok: true` |
| Save result | `get_active_drawing_info` (`saved: true`) |
| Screenshot evidence | `capture_screenshot` (inspect returned image) |
| Visual alignment when observable in the screenshot | screenshot inspection |

**MVP primary verification = handle/existence checks + layer/type checks +
screenshot inspection + operation result.**

### NOT numerically verifiable with the current MCP

- Actual line endpoints
- Actual polyline vertices
- Actual entity center
- Actual entity position
- Actual entity length independent of supplied measurement points

`add_linear_dimension` measures between **agent-supplied points**. A dimension
whose `measurement_mm` matches an expectation therefore does **NOT** constitute
independent proof of the drawn entity's geometry — if the entity were drawn
elsewhere, the same points would still produce the same measurement.

---

## Verification Toolkit (MCP-Based)

These are the tools available for verification. Use exact signatures from `tool_contracts.md`.

| Verification Need | Role | MCP Tool | How to Use |
|------------------|------|----------|-----------|
| Entity was created | **Primary** | `query_entities` | Filter by `layer` + `object_name`; confirm new handle in diff |
| Element on correct layer | **Primary** | `query_entities` | Filter by expected layer; handle should appear in result |
| No duplicates | **Primary** | `query_entities` | Compare handles against pre-operation snapshot (`limit: 1000`, `max_scan: 5000`, `truncated == false`) |
| Entity type / counts | **Primary** | `query_entities` | `object_name` + count vs. state record |
| Spatial layout / visual alignment | **Primary** | `zoom_extents` + `capture_screenshot` | Visual review of MCP returned image; confirm `was_foreground == true` |
| Drawing is saved | **Primary** | `get_active_drawing_info` | Check `saved: true` after `save_active_drawing` |
| Line length / room width (unit sanity) | **Sanity check only** | `add_linear_dimension` | Dimension between supplied points; read `measurement_mm` — confirms units/measurement behavior, **not** the entity's actual geometry |

---

## Dimensional Checks Are Sanity Checks, Not Geometry Proof

The dimensional operation (`add_linear_dimension`) may still be used as a
**unit / AutoCAD measurement sanity check**, but the Skill must never describe
it as independent geometry verification:

- ✓ Acceptable: "measurement between [0,0] and [6000,0] returned 6000mm —
  unit conversion behaves as expected."
- ✗ Not acceptable: "the north wall is at y=4000 because the dimension
  returned 4000mm." The dimension measured the supplied points, not the wall.

When a sanity check disagrees with expectations, treat it as a failure signal
and STOP (a mismatch still indicates a problem). When it agrees, it confirms
only the measurement, not the entity position.

**Record all verification dimensions.** Erase them only after confirming the
measurement. Do NOT erase a dimension before reading it. Cleanup of
agent-created `_VERIFY_DIM` artifacts falls under the verification-artifact
exception in `risk_rules.md` (no separate RED approval; all four conditions
must hold).

---

## Phase Quality Gate Procedure

Run this at the end of every phase before updating `project_state.md` as COMPLETE:

```
1. zoom_extents
   → Ensures all geometry is visible in active window

2. capture_screenshot (width_px: 1400)
   → Inspect returned image content in MCP response
   → Verify data["was_foreground"] == true
   → This screenshot is PRIMARY verification evidence

3. For each HIGH-priority dimension in this phase (SANITY CHECK — not
   independent geometry verification):
   add_linear_dimension
     start_mm: [reference point]
     end_mm: [element endpoint]
     dimension_line_point_mm: [offset from line]
     orientation: "aligned" (or "horizontal" / "vertical")
     layer: "_VERIFY_DIM"
   → Read measurement_mm from response data
   → Compare to requirement: |measurement_mm - required_mm| ≤ 1mm → PASS
   → If difference > 1mm → FAIL
   → NOTE: measurement_mm is computed from the supplied points; a match
     confirms units/measurement behavior only, NOT the entity's geometry.

4. erase_entity (handle: [dimension handle])
   → Clean up temporary verification dimension
   → Agent-created artifact on _VERIFY_DIM — verification-artifact exception
     in risk_rules.md applies (all four conditions must hold)

5. query_entities (layer: "[phase layer]", limit: 1000, max_scan: 5000)
   → Confirm all expected handles are present; truncated == false

6. Evaluate constraint checklist (from constraints.md):
   → Each constraint applicable to this phase: PASS or FAIL
   → Constraints involving actual entity position can be confirmed
     visually in the screenshot only (MCP exposes no coordinates)

7. Quality gate verdict (based on primary evidence):
   → Expected handles present & correct type/layer ✓
   → Screenshot visually acceptable & foreground ✓
   → Entity counts match state ✓
   → All applicable constraints: PASS ✓
   → Sanity-check dimensions: PASS ✓
   → → PHASE QUALITY GATE: PASS

   → Any FAIL → PHASE QUALITY GATE: FAIL → do not proceed
```

---

## Correction Procedure (When Quality Gate Fails)

```
Attempt 1:
  1. Diagnose: which specific check failed? what value was found vs. expected?
  2. Form a correction plan: what tool call(s) will fix this?
  3. If fix requires erasing → checkpoint first via save_drawing_as
  4. Execute correction
  5. Re-run quality gate

Attempt 2 (if Attempt 1 fails):
  1. Capture screenshot to review current visual state
  2. Try an alternative correction approach
  3. Execute
  4. Re-run quality gate

If both attempts fail:
  STOP — BLOCKED
  Report: what was attempted, what was found each time, what is needed
  Do NOT continue to the next phase
  Do NOT attempt a third autonomous correction
```

---

## Dimension Management

Dimensions added for verification are temporary measurement aids:

- **Verification dimension:** layer `_VERIFY_DIM` — erase after reading `measurement_mm`
- **Design dimension:** layer `DIMENSIONS` — keep permanently as part of the drawing

Workflow:
```
1. create_layer (name: "_VERIFY_DIM", color_aci: 8) — if not exists
2. add_linear_dimension (start_mm: ..., end_mm: ..., dimension_line_point_mm: ..., layer: "_VERIFY_DIM")
3. Read measurement_mm from response data
4. Compare to requirement
5. erase_entity (handle: dimension_handle)
```

---

## Screenshot Verification Rules

- `capture_screenshot` does **not** take a `path` parameter. It does not write to disk.
- The image is returned as an in-memory MCP `ImageContent` object (`mimeType: "image/png"`).
- Always inspect `was_foreground` in the returned data payload:
  - If `was_foreground == false`: Another window covered AutoCAD; screenshot may be obscured.
  - If AutoCAD was minimized: Tool raises an error asking user to restore window.
- Visual inspection confirms spatial layout, topology, and absence of visual artifacts.
- Screenshots are **primary** geometric evidence with the current MCP: they,
  combined with handle/layer/type checks, are what the MVP relies on to
  confirm spatial correctness. Sanity-check dimensions complement them but
  do not independently prove entity geometry.

---

## Verification After Modification (MODIFY_PROJECT)

After any `move_entity` or geometry modification:

1. Handle/existence check: the modified handle still resolves via `query_entities`
   on its expected layer (primary evidence the entity exists and wasn't replaced).
2. Run an optional `add_linear_dimension` sanity check across the expected
   displacement — this confirms units/measurement behavior only; it is
   **not** independent proof of the entity's new position.
3. `capture_screenshot (width_px: 1400)` and confirm the visual result
   matches the intended change (primary positional evidence available today).
4. Verify dependent entities still connect properly (visual + handle checks).
5. Verify all constraints involving the modified element are satisfied
   (as far as the MCP evidence allows; note any unverifiable items honestly).
6. Update position notes in `project_state.md`.
