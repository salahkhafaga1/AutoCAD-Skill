# Engineering CAD Agent Skill

An engineering-focused AI agent skill that enables an agent runtime such as
[OpenCode](https://opencode.ai) to reason about CAD projects: understand
requirements, inspect project state, assess complexity, decompose complex work
into phases, execute CAD operations through an AutoCAD MCP integration, verify
results, recover from failures, maintain project state, and continue
unfinished projects.

This skill is a **reasoning and workflow layer**. It does not talk to AutoCAD
directly and it does **not** replace the MCP tool layer — it drives a fixed,
scoped set of MCP tools with engineering discipline.

---

## Architecture

```
Engineer
  ↓  natural language
Engineering CAD Agent Skill      ← this repository (reasoning, workflow, state)
  ↓  structured plan & tool calls
OpenCode Agent Runtime           ← host that loads the skill and the MCP server
  ↓  MCP tool calls
autocad-mcp                      ← separate repository (low-level tool layer)
  ↓  COM / ActiveX
AutoCAD
```

### Layer responsibilities

**Engineering CAD Agent Skill (this repository) — the reasoning layer:**

- Requirements understanding and ambiguity detection
- Project analysis and complexity assessment
- Planning and decomposition into phases
- Execution workflow (one phase step at a time)
- Verification and phase quality gates
- Failure detection and recovery
- Project state management (project memory files)
- Design intent and decisions
- Assumptions and constraints tracking
- Risk classification with human-approval gating
- Continuation of unfinished projects

**autocad-mcp (separate repository, not included here) — the tool layer:**

- Low-level AutoCAD integration: session/connection information, document
  management, layer and entity queries, geometry creation, editing,
  dimensions, and screenshots — exposed as a fixed set of MCP tools.

The skill never calls tools outside the MCP contract and never modifies the
MCP layer. See `tool_contracts.md` for the authoritative tool reference the
skill is validated against.

---

## Core Reasoning Loop

```
Understand → Analyze → Plan → Execute → Observe → Verify → Correct
           → Update State → Continue
```

- **Understand** — identify the operating mode, extract requirements, detect ambiguity (ask instead of guessing)
- **Analyze** — connect to AutoCAD, read project state, inspect the drawing when continuing or modifying
- **Plan** — estimate complexity, decompose into phases, classify each operation by risk
- **Execute** — run one phase step at a time with a pre-execution state check
- **Observe** — confirm the entity was created and capture its handle
- **Verify** — primary evidence first: handle/existence, layer/type/counts, screenshot, operation results
- **Correct** — diagnose discrepancies and correct (maximum 2 attempts, then stop)
- **Update State** — commit project memory at milestones, checkpoints, and after verification
- **Continue** — proceed when safe, pause and ask when the next step is risky or ambiguous

---

## Workflow Modes

| Mode | Trigger | Key rule | Workflow file |
|------|---------|----------|---------------|
| `NEW_PROJECT` | "create", "design", "draw a new…" | Always plan before executing | `workflows/new_project.md` |
| `CONTINUE_PROJECT` | "continue", "resume", "where were we?" | Always re-inspect the DWG before acting | `workflows/continue_project.md` |
| `MODIFY_PROJECT` | "move", "change", "update", "modify" | Checkpoint and re-verify state before mutating | `workflows/modify_project.md` |
| `INSPECT_PROJECT` | "describe", "analyze", "what is…" | Read-only tools only | `workflows/inspect_project.md` |
| `VERIFY_PROJECT` | "verify", "check", "does it match…" | Observe and check evidence; never trust success responses alone | `workflows/verify_project.md` |
| `PLAN_ONLY` | "what would you do", "plan but don't…" | No mutating tools | `workflows/plan_only.md` |
| `RECOVER_PROJECT` | "something went wrong", errors, state mismatch | Diagnose before acting | `workflows/recover_project.md` |

---

## Project Memory

All project state is stored as human-readable markdown under
`{ACAD_MCP_OUTPUT_ROOT}/projects/{project_name}/`:

```
projects/{name}/
├── project_spec.md      ← what to build (requirements)
├── project_state.md     ← where we are now (phase, handles, sync record)
├── constraints.md       ← rules the design must obey
├── decisions.md         ← why each element exists (design intent)
├── assumptions.md       ← what was assumed (confidence + approval status)
├── issues.md            ← what is blocking or unresolved
├── change_log.md        ← what changed and when
└── phases/
    ├── phase_01_*.md
    ├── phase_02_*.md
    └── ...
```

`schemas/` contains JSON schemas for these files and `templates/` contains
blank starting templates. State is committed at phase milestones,
checkpoints, and after verification — not after every individual step.

---

## Risk & Safety Model

Every planned operation is classified before execution
(full rules in `rules/risk_rules.md`):

| Level | Examples | Behavior |
|-------|----------|----------|
| 🟢 **GREEN** | Basic geometry, layers, text, queries, screenshots | Autonomous execution, verified after |
| 🟡 **YELLOW** | Layouts, doors/windows, dimensions, moves | Execute, then verify before continuing |
| 🔴 **RED** | Structural / safety / code-critical decisions, erasing user geometry, large-scale modifications | Explicit human approval required before execution |

Engineering judgment calls (structural systems, fire ratings, egress, MEP
routing) always stop for a professional decision — the agent models what the
engineer decides; it does not make safety decisions autonomously.

---

## Verification: What It Can and Cannot Prove

Be aware of the current verification boundary:

**Can be verified with the current MCP integration:**

- operation / tool call results
- entity existence and handles
- layer, object type, and entity counts
- screenshots (in-memory image inspection)
- save / operation results
- visual alignment when observable in the screenshot

**Cannot currently be claimed:**

- The MCP layer does **not** provide independent coordinate-level geometry
  read-back (no entity endpoints, vertices, or centers). A dimension measured
  between agent-supplied points is a **unit/measurement sanity check**, not
  independent geometric verification.

MVP verification therefore relies on **handle/existence checks + layer/type/
counts + screenshot inspection + operation results**. Geometry read-back is
listed in the roadmap pending real-world testing.

---

## Current Status

- **Static validation: PASS** — `tests/validate_skill.py` validates the
  documentation against the actual MCP schemas (tool names, parameter names,
  referenced files, forbidden/obsolete patterns).
- **MCP wiring: TESTED** — the MCP server launches from a dedicated virtual
  environment, exposes its full tool catalog, and returns a clean,
  expected connection error when AutoCAD is absent.
- **Live AutoCAD validation: PENDING** — this project does **not** claim
  production-ready live AutoCAD testing. Live end-to-end testing remains a
  separate step on a machine with AutoCAD installed and running.

---

## Quick Start

**Prerequisites:** Windows, Python 3.10+, an agent runtime (OpenCode), a
checkout of the separate `autocad-mcp` server installed into a virtual
environment, and — for live use only — AutoCAD with a drawing open.

```powershell
git clone https://github.com/salahkhafaga1/AutoCAD-Skill.git
```

1. **Load the skill in OpenCode** — either place/clone this repository under
   `.opencode/skills/engineering-cad-agent/` (auto-discovered), or add the
   folder that contains it to the `skills` array in your `opencode.json`.
2. **Register the MCP server** — see `opencode.example.json` for the
   project-local MCP configuration shape (`mcp.servers`, local server,
   venv entry point, `ACAD_MCP_OUTPUT_ROOT`). Replace the placeholders with
   your machine's paths; the example intentionally contains no machine paths.
3. **Validate the skill:**

```powershell
python tests/validate_skill.py
```

Full parameter-vs-schema validation requires a checkout of `autocad-mcp`
as a sibling directory; without it the validator runs in a clearly reported
degraded mode (tool names only).

4. **Live use:** open AutoCAD with a drawing, then ask the agent to
   `create`, `continue`, `verify`, etc.

---

## Project Structure

```
.
├── SKILL.md                  ← skill entry point: core loop, modes, policies
├── tool_contracts.md         ← authoritative reference for all MCP tools
├── opencode.example.json     ← example OpenCode skill + MCP wiring (placeholders)
├── LICENSE
├── README.md
├── workflows/                ← one workflow per operating mode (7 modes)
├── rules/                    ← planning, verification, risk, stop conditions,
│                               state sync, duplicate prevention, requirements
├── schemas/                  ← JSON schemas for project memory files
├── templates/                ← blank project memory templates
├── examples/
│   └── simple_room/          ← worked example (spec, state, phase files)
└── tests/
    └── validate_skill.py     ← static validation of the skill
```

---

## Testing

- **Skill validator** (part of this repository):

  ```powershell
  python tests/validate_skill.py
  ```

  Checks that referenced workflow/rule/template files exist, that referenced
  MCP tools and parameter names match the actual MCP schemas, and that
  obsolete patterns are absent. Current result: **PASS**.

- **MCP offline tests** live in the separate `autocad-mcp` repository and do
  not require AutoCAD. They have been run successfully against this skill's
  wiring environment (105 tests, OK).

- **Live AutoCAD tests** are not part of this repository and remain pending.

---

## Roadmap

Realistic future work only — none of these are implemented yet:

- Live AutoCAD MVP validation (first end-to-end run against a real drawing)
- Geometry read-back capability, **only if** live testing proves it necessary
  (would be implemented in `autocad-mcp`, not in this skill)
- Additional engineering-specific worked examples
- Broader automated integration tests

---

## License

MIT — see [LICENSE](LICENSE).
