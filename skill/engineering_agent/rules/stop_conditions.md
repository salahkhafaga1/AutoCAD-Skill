# Stop Conditions

The Engineering CAD Agent MUST stop execution and explain itself clearly
whenever any of the following conditions are true. Stopping is not a failure —
it is the correct engineering response to uncertainty or risk.

---

## Category A — Missing Requirements

Stop when a required value is not known and guessing would be wrong:

| Condition | Why it matters |
|-----------|---------------|
| A critical dimension is unspecified (e.g., wall height for a multi-floor building) | Wrong value propagates through all dependent phases |
| A room function is undefined but affects adjacency requirements | Placement decisions will be wrong |
| The structural system is unknown for a structural project | Cannot determine load paths |
| The project site dimensions are unknown | Cannot place anything |
| Building code jurisdiction is unknown for code-critical dimensions | Cannot validate egress, clearances |

**Action:** List every missing requirement. Ask specific, numbered questions.
Do not attempt to infer critical values from vague descriptions.

---

## Category B — Ambiguity Requiring Human Decision

Stop when two or more interpretations are valid and the choice affects design:

| Condition | Example |
|-----------|---------|
| Location of an element is underspecified | "Add a door to the wall" — which wall? where on the wall? |
| Dimension has an implicit range with multiple valid values | "A normal-sized bedroom" — 10m²? 12m²? 15m²? |
| Conflicting requirements exist | REQ-001 says kitchen north, REQ-004 says kitchen adjacent to south entrance |
| User says "standard" without specifying which standard | "Standard ceiling height" — which building code? |

**Action:** Present the ambiguity explicitly. Offer specific options where possible.
Wait for the user to choose before proceeding.

---

## Category C — Verification Failure

Stop when the agent cannot confirm the work is correct:

| Condition | Trigger |
|-----------|---------|
| A measurement sanity check does not match the required dimension | `measurement_mm` from `add_linear_dimension` ≠ expected value (a mismatch is a failure signal; a match proves only the measurement, not entity geometry) |
| Correction has been attempted 2 times and still fails | Repeated verification failure |
| An expected entity cannot be found in `query_entities` | Entity creation may have silently failed |
| A critical quality gate fails and the next phase depends on it | Cannot continue to dependent work on a broken foundation |

**Action:** Report the exact discrepancy. Explain what was expected vs. what was
found. List options for recovery. Do not attempt a third correction autonomously.

---

## Category D — State Inconsistency

Stop when the DWG state does not match what the agent expects:

| Condition | Trigger |
|-----------|---------|
| A handle from `project_state.md` is not returned by `query_entities` on its expected layer | User may have manually deleted or modified the entity |
| State evidence (handles / counts / screenshot) cannot confirm the expected entity state before a modification | Position cannot be numerically measured with the current MCP; applying a stale displacement would cause misplacement |
| Entity count on a layer differs significantly from the state record | User may have modified the drawing manually |
| `get_active_drawing_info` returns a different file path than expected | Wrong drawing is open |
| `unit_warning` is present and measurements are being relied upon | Unitless drawing — measurements are unreliable |
| The drawing is read-only (`readonly: true`) | Cannot write to this drawing |

**Action:** Describe what was expected vs. what was found. Offer to re-inspect
the DWG and rebuild the state record. Do not proceed with stale assumptions.

---

## Category E — Risk and Approval

Stop when explicit human approval has not been given for a risky operation:

| Condition | Risk Level |
|-----------|-----------|
| About to call `erase_entity` on any entity **except agent-created temporary verification artifacts on `_VERIFY_DIM`** (see `risk_rules.md` erase exception) | 🔴 RED |
| About to make a structural placement decision | 🔴 RED |
| About to modify safety-critical dimensions (egress, stair geometry) | 🔴 RED |
| About to execute the first phase of a plan that has not been reviewed | 🔴 RED |
| About to modify 10+ entities in a single operation | 🔴 RED |
| Entering a phase that was flagged for approval in the plan | 🔴 RED |

**Action:** Present the operation, describe what it will do, identify what it
will affect, and ask: "Do you approve this operation? [Yes / No / Modify the plan]"

---

## Category F — AutoCAD Connection Problems

Stop when the tool layer is unavailable:

| Condition | Response |
|-----------|----------|
| `autocad_status` returns `ok: false` | Stop all operations. Inform user AutoCAD is not connected. |
| A tool call fails with a connection error (e.g. `"No running AutoCAD session was found..."` or `"AutoCAD COM error: ..."`) | Stop. AutoCAD may have crashed or been closed. |
| COM error on geometry tool | Stop the current operation. Do not retry blindly. Inspect state first. |
| No active drawing | Inform user to open or create a drawing in AutoCAD. |

---

## Category G — Engineering Judgment Required

Stop when the decision requires professional engineering knowledge:

| Condition | Example |
|-----------|---------|
| Load-bearing determination | "Is this wall structural?" |
| Foundation type selection | "What foundation does this building need?" |
| MEP routing decisions | "Where should the HVAC ducts run?" |
| Fire compartment boundaries | "Which walls need to be fire-rated?" |
| Seismic or wind design | "What is the required wall bracing?" |

**Action:** Clearly state that this decision requires professional engineering
judgment. The agent can model what the engineer decides, but cannot make
structural or safety decisions autonomously.

---

## Category H — Complexity Overload

Stop when the request is too large for single-cycle execution:

| Condition | Threshold |
|-----------|-----------|
| Project has > 5 identifiable phases | Decompose and plan first; do not execute |
| Phase has > 20 individual tool calls | Split the phase |
| A single modification affects > 10 entities | Plan and get approval before executing |
| The request is for an entire building with no requirements | Gather requirements first |

---

## How to Stop Correctly

When stopping, always provide:

```
STOP REASON: [Category and specific condition]

WHAT WAS EXPECTED: [what the agent planned to do]

WHAT WAS FOUND / WHAT IS MISSING: [the specific problem]

WHAT IS NEEDED TO CONTINUE:
  1. [specific answer or action required]
  2. [specific answer or action required]

CURRENT STATE: [safe — no changes made / partial — changes saved at checkpoint]
```

Never stop silently. Never stop with just "I can't do that."
