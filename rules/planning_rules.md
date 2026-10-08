# Planning Rules

The agent plans before executing. Planning is not optional. The depth of planning
scales with project complexity.

---

## Complexity Classification

Classify the project before planning. This determines how much planning is required.

| Level | Criteria | Planning Depth | Approval Required? |
|-------|----------|---------------|-------------------|
| SIMPLE | 1 element type, ≤ 10 tool calls, no dependencies | 1-2 sentence plan, proceed | No |
| MODERATE | 2–4 element types, 10–30 tool calls, 2–3 phases | Write phase files, present | Yes (plan approval) |
| COMPLEX | 5+ element types, 30–100 tool calls, 4–8 phases | Full phase files + dependency graph | Yes (plan approval) |
| ENTERPRISE | Multi-floor or multi-system, > 100 tool calls, 8+ phases | Full documentation first | Yes (phase-by-phase approval) |

**Rule:** Never classify a project as SIMPLE if it involves structural decisions,
multi-room layouts, or multi-floor elements.

---

## Phase Decomposition

A phase is a unit of work that:
- Has a clear, verifiable completion criterion
- Can be checkpointed (drawing saved before next phase begins)
- Has a defined set of MCP tool calls
- Can be safely paused and resumed

### Standard Phase Structure

```markdown
## Phase NN — [Name]

### Goal
[Single sentence: what this phase achieves]

### Prerequisites
- Phase [previous] must be COMPLETE
- [Any specific entity or state required to exist]

### Steps
| Step | Description | Tool | Risk | Verification |
|------|-------------|------|------|-------------|
| 01 | [action] | draw_polyline | 🟢 | query_entities |
| 02 | [action] | add_linear_dimension | 🟢 | measurement_mm == N (sanity check) |

### Completion Criteria
- [ ] [Specific verifiable condition]
- [ ] [Specific verifiable condition]

### Quality Gate
- All expected handles present with correct type/layer (query_entities)
- Entity count on layer [X] = [N]
- Screenshot taken and visually acceptable (primary geometry evidence)
- Measurement sanity checks within ±1mm of requirements (not independent coordinate proof)

### Checkpoint
Save to: checkpoints/{project}_{phase}.dwg
```

---

## Dependency Rules

1. **Never start a phase before its prerequisites are COMPLETE + VERIFIED.**
2. Record dependencies explicitly in the phase file.
3. If a prerequisite phase failed its quality gate, do not continue — stop and resolve.

### Common Dependency Patterns

| Phase Type | Typical Prerequisites |
|-----------|----------------------|
| Floor plan walls | Site boundary / drawing setup |
| Doors and windows | All walls on affected room complete |
| Interior partitions | Exterior walls complete |
| Dimensions | All geometry for that room complete |
| Furniture / blocks | Room layout complete |
| Annotations / text | Geometry + dimensions complete |

---

## Phase Sizing Rules

| Rule | Reason |
|------|--------|
| Maximum 20 tool calls per phase step | Limits damage from a failure |
| Maximum 7 steps per phase | Forces clear sub-goals |
| One quality gate per phase | Verification is non-negotiable |
| One checkpoint per phase | Recovery requires save points |
| One phase at a time | Never start Phase N+1 while Phase N is unverified |

---

## Execution Order

1. Drawing setup (create drawing, set INSUNITS, create layers)
2. Site or bounding geometry (site boundary, reference lines)
3. Primary structure (exterior walls, major structural elements)
4. Secondary structure (interior partitions, columns)
5. Openings (doors, windows — cut into walls)
6. Dimensions (annotate completed geometry)
7. Text and labels
8. Paper space / layout (if required)

This order cannot be reversed arbitrarily. You cannot add doors before the
walls exist. You cannot dimension geometry that doesn't exist.

---

## When to Plan vs. When to Execute

| Request Type | Agent Response |
|-------------|---------------|
| "Draw a line from A to B" | No phase planning — execute immediately (GREEN) |
| "Create a 6×4m room" | 1-step plan, confirm with user, execute |
| "Design a 2-bedroom apartment" | Full phase plan, present for approval, then execute Phase 1 |
| "Design a 5-floor building" | Full phase plan, stop after plan delivery, wait for requirements + approval |

---

## Re-planning Triggers

Re-plan (do not blindly continue) when:

- A phase fails its quality gate
- A prerequisite is found to be incomplete when the next phase begins
- The user modifies a requirement after planning is complete
- The agent detects a state mismatch in the DWG
- The user requests a change to an already-planned element

When re-planning, clearly state what changed and why the plan was updated.

---

## Plan Presentation Format

For MODERATE and above, present the plan before execution:

```
PROJECT PLAN: [Name]
Complexity: [level]
Phases: [N]

Phase 01 — [Name] (est. [N] tool calls)
  Goal: [single sentence]
  Risk: 🟢 GREEN
  
Phase 02 — [Name] (est. [N] tool calls)
  Goal: [single sentence]
  Risk: 🟡 YELLOW
  Requires approval before starting

Phase 03 — [Name] (est. [N] tool calls)
  Goal: [single sentence]  
  Risk: 🔴 RED — [why red]
  Requires explicit approval before starting

Checkpoints: After each phase
First phase to execute: Phase 01

→ Type "approve" to begin Phase 01.
→ Type "modify" to change the plan.
→ Type "stop" to save the plan without executing.
```
