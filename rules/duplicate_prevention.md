# Duplicate Prevention Rules

When a tool call fails, times out, or a session is interrupted, the agent must
NEVER blindly retry without first inspecting the current state of the drawing.
Duplicate geometry causes verification failures, visual errors, and CAD database
inconsistency.

---

## The Golden Rule

> **Before creating any entity: take a handle snapshot.**
> **After any failure or timeout: diff handles before retrying.**

---

## Handle Snapshot Diffing Pattern

The agent maintains exact entity tracking in memory and project state files.
**It does NOT pollute the CAD drawing with internal bookkeeping text entities.**
No post-success registry entity is written into the DWG — duplicate prevention
relies solely on pre-operation handle snapshots and post-operation handle diffs.

### 1. Pre-Operation Handle Snapshot
Before executing any geometry creation tool (`draw_line`, `draw_polyline`, etc.):

```
1. query_entities
     space: "model"
     layer: "[target layer]"
     limit: 1000
     max_scan: 5000

2. If truncated == true:
   → The snapshot is INCOMPLETE and must NOT be treated as authoritative.
   → STOP or re-query to obtain a complete snapshot before any
     retry-sensitive operation (never retry on a partial snapshot).

3. Record the set of existing handles on this layer:
   snapshot_handles = {e["handle"] for e in entities}
```

### 2. Normal Execution
Execute the tool call using exact parameters from `tool_contracts.md`.
Upon receiving the response:
- Verify `ok: true`.
- Record the returned handle: `new_handle = response["data"]["entity"]["handle"]`.
- Verify `new_handle not in snapshot_handles`.

---

## Handling Timeouts, Crashes, and Dropped Responses

If a network glitch, process timeout, or connection drop occurs mid-call, the agent
cannot know whether AutoCAD completed the command before the response was lost.

**Do NOT immediately retry the draw command.**

Follow this reconciliation procedure:

```
Step 1: Check AutoCAD session
  autocad_status
  get_active_drawing_info

Step 2: Query the target layer
  query_entities
    space: "model"
    layer: "[target layer]"
    limit: 1000
    max_scan: 5000
  If truncated == true:
    → Snapshot incomplete — NOT authoritative. Re-query / STOP before
      deciding whether a retry is safe.
  current_handles = {e["handle"] for e in entities}

Step 3: Compute handle diff
  diff_handles = current_handles - snapshot_handles

Step 4: Evaluate diff:
  Case A — Exactly one new handle exists (len(diff_handles) == 1):
    → The operation SUCCEEDED in AutoCAD before the response was lost!
    → Adopt the newly discovered handle: handle = diff_handles.pop()
    → Perform dimensional verification to confirm it matches the planned geometry.
    → If verified, update project state with the adopted handle.
    → DO NOT execute a retry. Proceed to the next planned step.

  Case B — No new handles exist (len(diff_handles) == 0):
    → The operation failed or was aborted before committing to AutoCAD.
    → It is SAFE to retry the tool call once.

  Case C — Multiple new handles exist (len(diff_handles) > 1):
    → Unexpected state drift occurred.
    → STOP and run recover_project workflow.
```

---

## Duplicate Recovery

If accidental duplicate geometry is detected:

```
1. zoom_extents
2. capture_screenshot (verify was_foreground == true)
3. query_entities on the affected layer to list all candidate handles.
4. Distinguish candidates: compare against the pre-operation snapshot handles,
   query results (type/layer), and screenshot inspection.
   (Measurement sanity checks between supplied points may assist, but the MCP
   exposes no coordinates — they cannot prove which handle is where.)
5. Present the handles to the user:
   "I found duplicate entities on layer [X]. Candidate handles: [H1, H2].
    Handle H1 matches the intended dimensions. Approve erasing H2?"
6. After user approval (RED risk):
   save_drawing_as (checkpoint backup)
   erase_entity (handle: H2)
   Verify layer count returns to expected.
```
