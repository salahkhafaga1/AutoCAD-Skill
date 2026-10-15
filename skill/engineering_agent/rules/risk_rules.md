# Risk Classification Rules

Every planned operation must be classified before execution. The classification
determines whether the agent can proceed autonomously, must verify first, or
must request explicit human approval.

---

## 🟢 GREEN — Autonomous, No Prior Approval Needed

Proceed without requesting approval. Verify after execution.

### GREEN Operations

| Operation | MCP Tool(s) |
|-----------|------------|
| Check AutoCAD connection | `autocad_status` |
| Get drawing information | `get_active_drawing_info`, `list_open_drawings` |
| List drawing contents | `list_layers`, `list_blocks`, `list_layouts`, `query_entities` |
| Adjust view | `zoom_extents` |
| Take screenshot | `capture_screenshot` |
| Create a new layer | `create_layer` |
| Set current layer | `set_current_layer` |
| Modify layer properties | `set_layer_properties`, `set_layer_linetype` |
| Draw geometry in an **empty area** with no existing nearby entities | `draw_line`, `draw_circle`, `draw_arc`, `draw_ellipse`, `draw_polyline`, `draw_point` |
| Add text labels and annotations | `draw_text`, `draw_mtext` |
| Add measurement dimensions | `add_linear_dimension` |
| Copy an entity to an empty area | `copy_entity` |
| Change entity layer | `set_entity_layer` |
| Save the drawing | `save_active_drawing`, `save_drawing_as`, `save_drawing_explicit` |
| Create a new drawing | `create_new_drawing` |
| Open a drawing | `open_drawing` |

**GREEN post-execution:** Always run `query_entities` to confirm the entity
was created. Record the handle in the state file.

---

## 🟡 YELLOW — Proceed With Verification Before Continuing

Execute, then verify before proceeding to dependent steps. Do not start the
next phase until YELLOW operations are confirmed correct.

### YELLOW Operations

| Operation | Why Yellow | Required Verification |
|-----------|-----------|----------------------|
| Drawing a complete room layout | Composite of many elements; must form a closed, dimensionally correct space | Dimension all sides; verify entity count |
| Placing a door or window opening | Modifies wall boundary; affects circulation and clearance constraints | Dimension width; verify position on wall |
| Moving an entity | Changes relative positions; may affect dependent geometry | Dimension new position from reference; check constraints |
| Copying near existing geometry | Risk of overlap or duplicate | Inspect after; verify no overlap |
| Inserting a block | Block must exist; scale must be correct | Query entity; verify position |
| Any operation affecting 5–10 entities | Higher complexity, higher error risk | Full layer audit after |
| Batch creation of 5–10 entities | Multi-entity write in one call | Query the batch back before continuing |
| Dimensioning a finished phase | Must match requirements | Compare all measurements to requirements |
| Making an assumption about a dimension | Assumption must be recorded and flagged | Record in assumptions.md; flag as UNRESOLVED |

**YELLOW post-execution:** Run full verification before marking the phase step
complete. Record the assumption if the agent used a default value.

---

## 🔴 RED — Explicit Human Approval Required Before Execution

**Do not call any mutating MCP tool until the human has explicitly said "yes",
"approved", "proceed", or equivalent.**

### RED Operations

| Operation | Why Red | Approval Message Template |
|-----------|---------|--------------------------|
| `erase_entity` | Destructive; no programmatic undo | "I am about to erase [element] (handle: [H]). This cannot be undone programmatically. A checkpoint will be saved first. Approve?" |
| First execution of any plan phase | Irreversible changes to drawing begin | "I am ready to begin Phase [N]: [description]. This will modify the drawing. Approve?" |
| Any structural placement decision | Safety-critical; requires professional judgment | "I am about to place [element] which functions as [structural role]. This requires engineering approval. Please confirm this placement is correct." |
| Safety-critical dimensions | Egress, stair rise/run, fire ratings | "The [dimension] I am about to use is [value]. This is a life-safety dimension. Please confirm this value complies with your applicable building code." |
| Modifications affecting > 10 entities | High-impact operation | "This modification will affect [N] entities. A checkpoint will be saved. Please review the plan and approve." |
| Any operation the agent is uncertain about | Uncertainty is a stop condition | "I am not certain [X]. Before proceeding, I need you to confirm [Y]." |
| Major spatial reorganization | Risk of cascading constraint violations | "Reorganizing [element group] will affect [list of dependencies]. Please review the impact and approve." |
| Phase entry when plan was flagged for approval | Plan review point | "The plan designated Phase [N] as requiring approval before execution. Do you approve?" |

`draw_batch` follows this modification scale exactly — 1–4 items 🟢, 5–10 🟡, and **more than 10 🔴** — with no batch-specific exemption.

### erase_entity Exception (Temporary Verification Artifacts Only)

`erase_entity` remains **🔴 RED by default.** The ONE exception applies only
when **all** of the following are true:

1. The entity was created by the agent during the current verification operation;
2. The entity is a temporary verification artifact;
3. The entity is on the `_VERIFY_DIM` layer;
4. Removing it does not modify user-authored geometry.

When all four conditions hold, the erase may proceed as part of verification
cleanup without a separate RED approval request.

**This exception applies ONLY to temporary verification artifacts.**
Any erase of user-authored geometry remains 🔴 RED and requires explicit
human approval, regardless of circumstances.

### RED Approval Format

When requesting RED approval, always include:

```
🔴 APPROVAL REQUIRED

Operation: [what will happen]
Tool: [MCP tool name]
Affected elements: [list of elements]
Risk: [what can go wrong]
Checkpoint: [will save / has saved to path/to/checkpoint.dwg]
Reversibility: [how to recover if needed]

→ Type "approve" or "yes" to proceed.
→ Type "no" or "stop" to cancel.
→ Type "modify" to change the plan.
```

---

## Risk Escalation

The following conditions automatically escalate risk from YELLOW → RED:

1. The drawing has not been checkpointed in the last 5 phase steps
2. The operation involves a dimension flagged as safety-critical in `constraints.md`
3. An assumption involved in the operation is marked `UNRESOLVED` in `assumptions.md`
4. The agent detects a state mismatch (DWG differs from state record)
5. The user has manually modified the drawing (detected by entity count change)

---

## Risk Labeling in Phase Files

Every step in a phase file must include its risk level:

```markdown
## Step 3 — Draw south exterior wall
Risk: 🟢 GREEN
Tool: draw_polyline
Verification: query_entities layer=WALLS-EXT; add_linear_dimension for length
```

---

## Emergency Stop

If the agent discovers mid-execution that an operation is riskier than
initially classified (e.g., the "empty area" turned out to have existing
geometry), stop immediately:

```
⚠️ RISK RECLASSIFICATION

I planned to [operation] as GREEN, but I have discovered [condition].
I am reclassifying this as [YELLOW/RED] and pausing.

[Standard stop message format]
```
