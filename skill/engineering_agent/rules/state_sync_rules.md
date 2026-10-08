# State Synchronization Rules

The agent's `project_state.md` represents what the agent BELIEVES is in the
drawing. The drawing is the ground truth. When they disagree, the drawing wins.

---

## The Stale State Problem

This scenario WILL happen:
1. Agent plans a modification (e.g. "Move door 500mm to the right").
2. User manually moves or edits the door in AutoCAD before the agent executes.
3. If the agent only checks entity count, the count has NOT changed!
4. The agent executes its old displacement vector, moving the door to an incorrect location.

Therefore, **entity counts alone are insufficient.** The current MCP exposes
no entity coordinates, so an entity's position cannot be numerically measured
independently. Before modifying, the agent must gather every available piece
of evidence — handle existence, layer/type/count checks, and screenshot
inspection — and must **STOP whenever that evidence cannot confirm the
expected state.**

---

## Pre-Session Sync Check (Always)

At the start of any `CONTINUE_PROJECT`, `MODIFY_PROJECT`, or `VERIFY_PROJECT` session:

```
Step 1: autocad_status → confirm AutoCAD connected
Step 2: get_active_drawing_info
  → Compare returned path to project_state.md "DWG Path"
  → If MISMATCH → STOP: wrong drawing is open

Step 3: For each layer listed in "State Sync Record" of project_state.md:
  query_entities (layer: [name], limit: 1000, max_scan: 5000)
  → Compare actual count to expected count in state
  → Record: MATCH or MISMATCH
  → If truncated == true: snapshot is incomplete — obtain a complete
    snapshot before trusting the result

Step 4: Validate handles in Handle Registry:
  Compare ALL expected handles that can be queried against the returned
  entities — not just a sample.
  → If truncated == true: do not draw a definitive conclusion; re-query
  → Any required handle missing → treat as stale state

Step 5: Verdict:
  → All layers MATCH + all handles OK → STATE IS FRESH → proceed
  → Layer count within ±1 + handles OK → MINOR DRIFT → warn + proceed carefully
  → Layer count off by >1 → SIGNIFICANT DRIFT → stop and re-inspect
  → Any target handle missing → HANDLE STALE → stop and re-inspect
  → Snapshot truncated / state cannot be trusted → STOP and re-analyze
```

---

## Pre-Execution Datum Check (Before Modifying Existing Geometry)

Before calling any mutating tool on existing entities (`move_entity`, `erase_entity`, etc.):

```
1. Identify the target entity by handle from the Handle Registry.
2. Existence check (primary evidence):
   query_entities (layer: [expected layer], limit: 1000, max_scan: 5000)
   - Confirm the handle is present in the results; truncated == false.
   - Handle missing → stale state → STOP.
   - Truncated snapshot → state cannot be trusted → STOP and re-query.

3. Layer / count check:
   - Compare entity counts against the State Sync Record.
   - Mismatch beyond tolerance → STOP and re-inspect.

4. Visual check:
   - zoom_extents () + capture_screenshot (width_px: 1400)
   - Confirm the drawing visually matches the expected state.

5. OPTIONAL measurement sanity check (NOT positional proof):
   - add_linear_dimension between agent-supplied points around the expected
     location on layer "_VERIFY_DIM"; read measurement_mm; erase the temp
     dimension (agent-created _VERIFY_DIM artifact — exception applies).
   - A MATCH confirms units/measurement behavior only — it does NOT prove
     the entity sits at that position (the MCP exposes no coordinates).
   - A MISMATCH is a failure signal → STOP.

6. Evaluate Datum Check:
   - Evidence (handle + counts + screenshot) consistent with project_state.md:
     → Safe to proceed with the planned displacement vector.
   - Evidence missing, inconsistent, or snapshot truncated:
     → STALE STATE CANNOT BE RULED OUT. The current MCP cannot numerically
       confirm an entity's position, so absence of proof is not proof.
     → DO NOT apply the planned displacement vector.
     → STOP immediately:
       "Stale state cannot be ruled out: [Element] expected [evidence], but
        [what was found]. The current MCP cannot independently measure entity
        position. Halting planned modification to prevent misplacement.
        Re-analyzing..."
```

---

## State Reconstruction (When State File is Missing)

If `project_state.md` does not exist for an existing drawing:

```
1. get_active_drawing_info → get name, path, INSUNITS
2. list_layers → inspect layer names and properties
3. query_entities on each layer → count and types
4. zoom_extents
5. capture_screenshot (verify was_foreground == true) → visual overview
6. Reconstruct a new project_state.md marked as [RECONSTRUCTED]
7. Present reconstruction to user and confirm before modifying anything.
```

---

## State Commit Policy (Avoiding Excessive File Writes)

To prevent context saturation and excessive file writes:
1. **During step-by-step execution:** Maintain new entity handles and progress in working memory.
2. **Before major mutations:** Save a checkpoint DWG via `save_drawing_as` and commit pre-change state.
3. **At sub-phase / phase completion:** Write the full updated `project_state.md`, `decisions.md`, and `change_log.md`.
4. **After verification:** Commit final verification results.
