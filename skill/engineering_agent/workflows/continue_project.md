# Workflow: CONTINUE_PROJECT

## Entry Conditions
- User says "continue", "resume", "where were we?", "what's next?"
- A project state file exists (or must be reconstructed)
- AutoCAD must be running with a drawing open

---

## The Core Rule

> Before doing ANYTHING, re-inspect the drawing to confirm it matches the
> project state record. Never proceed based on stale assumptions.

---

## Workflow Steps

### Step 1 — Connect

```
autocad_status
→ If ok: false → STOP: cannot continue, AutoCAD not connected
→ If ok: true → continue

get_active_drawing_info
→ Record: path, INSUNITS, saved status
```

### Step 2 — Load Project State

Find `project_state.md`:
```
Location: {ACAD_MCP_OUTPUT_ROOT}/projects/{project_name}/project_state.md
```

If the path is unknown → ask user: "Which project? Please provide the project name or path."

If state file NOT FOUND:
→ Do NOT guess.
→ Enter INSPECT + RECONSTRUCT mode:
  - Read the DWG via query_entities on all layers
  - Take a screenshot
  - Create a reconstructed project_state.md (marked RECONSTRUCTED)
  - Present reconstruction to user: "I found this in the drawing. Does this match your project?"
  - Wait for confirmation before proceeding

### Step 3 — State Sync Check

Apply `rules/state_sync_rules.md` pre-session sync check:

```
1. Verify drawing path matches project_state.md
2. Verify entity counts on all tracked layers
   (query_entities with limit: 1000, max_scan: 5000; if truncated == true
   the snapshot is incomplete — obtain a complete snapshot before trusting it)
3. Validate handles from the Handle Registry: compare ALL expected handles
   that can be queried against the returned entities — not just a sample.
   If truncated == true, do not draw a definitive conclusion from the result.
   → Any required handle missing → treat as stale state (HANDLE STALE)
   → State cannot be trusted → STOP and re-analyze
```

**If state is FRESH:** proceed to Step 4.

**If MINOR DRIFT detected:** 
```
"Note: The drawing has [N] more/fewer entities on layer [X] than expected.
This may be from a previous partial step. I will note this and proceed carefully."
```
Update state sync record, continue.

**If SIGNIFICANT DRIFT detected:**
```
STOP
"The drawing has changed significantly since I last worked on it.
Expected [N] entities on [layer], found [M].
Please tell me:
  1. Did you manually modify the drawing?
  2. Should I re-inspect and rebuild my understanding of the current state?"
```
Wait for instruction.

### Step 4 — Identify Current Position

Read from project_state.md:
- Current Phase
- Current Step (step N of M)
- Next Action description

Present to user:
```
Project: [name]
Current Phase: [N] — [name]
Status: [phase status]
Current Step: [step N of M]

I was working on:
  [Next Action description from state]

Layer counts verified:
  ✓ WALLS-EXT: [N] entities (matches record)
  ✓ DOORS: [N] entities (matches record)

Ready to continue from: [specific action]

→ Type "continue" to proceed.
→ Type "show me what's done" to see a screenshot first.
→ Type "restart phase" to re-run the current phase from the beginning (requires re-verification first).
```

### Step 5 — Continue Execution

Resume from the "Next Action" in project_state.md.

Follow the same `EXECUTE → OBSERVE → VERIFY → UPDATE STATE` loop from NEW_PROJECT workflow.

**Do NOT re-execute any step marked as complete in the phase file.**

For each remaining step:
1. Pre-execution state check on the target layer
2. Execute the tool
3. Verify

Maintain step progress and new handles in working memory during execution.
**Do NOT write `project_state.md` after every individual step.** Follow the
State Commit Policy in `rules/state_sync_rules.md`:
- Commit persistent state at phase / sub-phase milestones
- Commit after verification
- Commit at checkpoints (before major mutations)
- Commit before pausing or stopping when appropriate

### Step 6 — Phase Completion

Same as NEW_PROJECT Step 8–9.

## Exit Conditions
- Resumed phase completes → next phase options presented
- All phases complete → project COMPLETE
- User pauses → clean state recorded

## Failure Conditions
- State file missing + user cannot confirm reconstruction → STOP, cannot continue blindly
- State drift too large to reconcile → STOP, request manual review
- Handle invalid after state sync check → STOP, re-inspect required
