# Phase [NN] — [Name]

**Phase ID:** [NN]  
**Project:** [project_name]  
**Goal:** [Single sentence: what this phase achieves]  
**Risk:** [🟢 GREEN / 🟡 YELLOW / 🔴 RED]  
**Status:** NOT_STARTED  

---

## Prerequisites

- Phase [NN-1] must be COMPLETE with quality gate PASS
- [Any specific entity or state that must exist]

---

## Steps

| # | Description | Tool | Risk | Verification |
|---|-------------|------|------|-------------|
| 01 | [action] | `[tool_name]` | 🟢 | [how to verify] |
| 02 | [action] | `[tool_name]` | 🟢 | [how to verify] |

---

## Tool Call Details

### Step 01
```
[tool_name]
  param1: value
  param2: value
```

---

## Completion Criteria

- [ ] [Specific verifiable condition]
- [ ] [Specific verifiable condition]

---

## Quality Gate

### Dimensions to Verify
| Description | Expected | Tolerance | Start Point | End Point |
|------------|---------|----------|------------|----------|
| [name] | [N]mm | ±1mm | [x,y] | [x,y] |

### Entity Counts
| Layer | Expected Count |
|-------|---------------|
| [layer] | [N] |

### Screenshot Required: [Yes / No]

---

## Checkpoint

```
save_drawing_as
  path: "checkpoints/{project}_phase[NN].dwg"
```

---

## Handle Registry Updates

| Element ID | Handle | Description | Layer |
|------------|--------|-------------|-------|
| [ID] | [TBD] | [description] | [layer] |
