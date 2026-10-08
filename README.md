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

**Current version:** 0.1.0 (see `CHANGELOG.md`) · **Docs:** [`docs/`](docs/)

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
- Continuation of unfinished projects and change management

**autocad-mcp (separate repository, not included here) — the tool layer:**

- Low-level AutoCAD integration: session/connection information, document
  management, layer and entity queries, geometry creation, editing,
  dimensions, and screenshots — exposed as a fixed set of MCP tools.

The skill never calls tools outside the MCP contract, never modifies the MCP
layer, and never bundles it. `skill/engineering_agent/tool_contracts.md` is
the authoritative tool reference the skill is validated against.
Full details: [`docs/architecture.md`](docs/architecture.md).

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

Workflow files live under `skill/engineering_agent/workflows/`.

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
└── phases/              ← phase files with steps, checks, results
```

JSON schemas for these files are in `skill/engineering_agent/schemas/`;
blank starting templates in `skill/engineering_agent/templates/`. State is
committed at phase milestones, checkpoints, and after verification — not
after every individual step.

---

## Risk & Safety Model

Every planned operation is classified before execution
(full rules in `skill/engineering_agent/rules/risk_rules.md`):

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
listed in the roadmap and gated behind a five-step process in
[`docs/verification.md`](docs/verification.md).

---

## Current Status

Test-level detail and evidence rules: [`docs/verification.md`](docs/verification.md).

- **Level 1 — static validation: PASS** — `tests/validate_skill.py` validates
  documentation and repo docs against the actual MCP schemas (tool names,
  parameter names, referenced files, forbidden/obsolete patterns).
- **Level 2 — offline MCP tests: PASS** — 105 tests against the external
  autocad-mcp checkout, no AutoCAD required.
- **Level 3 — MCP wiring: PASS (post-restructure)** — the skill was
  re-discovered and loaded live from `skill/engineering_agent/` (project
  config path, ID `engineering_agent`), and the MCP server still exposes all
  29 tools.
- **Level 4 — live AutoCAD: PENDING** — this project does **not** claim
  production-ready live AutoCAD testing. AutoCAD is not installed on the
  development machine; live end-to-end testing remains a separate step.
- **Installer tests: PASS** — 53 automated tests of the npm CLI (default
  global target, `--local`, migration and its safety rules, skill ID and
  frontmatter discovery requirements, dry-run, config preservation,
  local-modification detection, update confirmation, rollback, doctor —
  including the `skill` permission — and invalid environments). Every test
  runs in a throwaway temp directory with its own `AUTOCAD_SKILL_HOME`; no
  test writes into the repository or into a real OpenCode skills folder.
- **OpenCode skill discovery: structural checks PASS, live TUI PENDING** —
  the installer tests verify the install target is one of OpenCode V2's
  documented discovery sources, that the skill ID is `engineering-cad`, and
  that nothing in the frontmatter hides the skill. The `/engineering-cad`
  entry has **not** been observed in a running TUI on this machine (no
  OpenCode CLI available here) — see `docs/verification.md`.

---

## Quick Start

**Prerequisites:** Windows, Python 3.10+, OpenCode V2, a checkout of the
separate autocad-mcp server installed into a virtual environment, and — for
live use only — AutoCAD with a drawing open. Details:
[`docs/installation.md`](docs/installation.md).

```powershell
git clone https://github.com/salahkhafaga1/AutoCAD-Skill.git
```

1. **Load the skill in OpenCode** — either run the installer:

   ```powershell
   npx autocad-skill install
   ```

   which copies the skill to `~/.config/opencode/skills/engineering-cad/`
   (an auto-discovered global source, so it works from any directory) and
   writes no configuration at all — then register the MCP server below. Use
   `--local` for a project-local copy at
   `<project>/.opencode/skills/engineering-cad/`. The skill is registered as
   **`engineering-cad`**, so OpenCode offers **`/engineering-cad`**.

   Prefer to wire it yourself? Add the skill folder to the `skills` array in
   your project's `opencode.json`:

   ```json
   { "skills": ["AutoCAD-Skill/skill"] }
   ```

   Manual alternative: copy `AutoCAD-Skill/skill/engineering_agent/` to
   `.opencode/skills/engineering-cad/` (auto-discovered; the directory name
   sets the skill ID).
2. **Register the MCP server** — see `opencode.example.json` for the
   project-local MCP configuration shape and [`docs/configuration.md`](docs/configuration.md)
   for field-by-field guidance. Replace the placeholders with your machine's
   paths; the example intentionally contains no machine paths.
3. **Validate the skill:**

   ```powershell
   python tests/validate_skill.py
   ```

4. **Live use:** open AutoCAD with a drawing, then ask the agent to
   `create`, `continue`, `verify`, etc.

> The `npx autocad-skill` installer is **IMPLEMENTED** since installer 0.2.0
> (`install`, `update`, `rollback`, `doctor`, `version`) — see
> [`installer/npm/README.md`](installer/npm/README.md) for the full behavior,
> including confirmation defaults, backups, and local-modification protection.

---

## Project Structure

```
.
├── skill/
│   └── engineering_agent/        ← the portable skill unit
│       ├── SKILL.md              ← entry point: loop, modes, policies
│       ├── tool_contracts.md     ← authoritative MCP tool reference
│       ├── skill.json            ← version manifest
│       ├── workflows/            ← one workflow per operating mode (7 modes)
│       ├── rules/                ← planning, verification, risk, stop
│       │                           conditions, state sync, duplicate
│       │                           prevention, requirements
│       ├── schemas/              ← JSON schemas for project memory files
│       ├── templates/            ← blank project memory templates
│       └── examples/             ← worked simple_room example
├── installer/npm/                ← npx layer: install/update/doctor/version
├── tests/
│   └── validate_skill.py         ← Level 1 static validation
├── docs/
│   ├── architecture.md           ← layers, responsibilities, hard rules
│   ├── installation.md           ← manual install + npx installer (IMPLEMENTED)
│   ├── configuration.md          ← OpenCode wiring reference
│   ├── development.md            ← structure, test levels, versioning policy
│   └── verification.md           ← honest capability limits + level status
├── README.md
├── CHANGELOG.md
├── LICENSE
├── .gitignore
└── opencode.example.json         ← placeholder-only wiring template
```

---

## Testing

Four test levels are defined in [`docs/development.md`](docs/development.md):

- **Level 1 — Static skill validation (this repository):**

  ```powershell
  python tests/validate_skill.py
  ```

  Checks that referenced skill files and repo-doc paths exist, that
  referenced MCP tools and parameter names match the actual MCP schemas, and
  that obsolete patterns are absent. Current result: **PASS**.

- **Level 2 — Offline MCP tests** live in the separate autocad-mcp
  repository and do not require AutoCAD (105 tests, OK on the reference
  setup).

- **Level 3 — MCP wiring**: skill advertisement + tool discovery in a live
  OpenCode session.

- **Level 4 — Live AutoCAD**: real drawing operations end to end.
  **PENDING — not claimed.**

The npm installer additionally has its own automated suite (34 tests with
`npm test` in `installer/npm/`) covering install, update confirmation,
rollback, doctor, and config preservation. It is **not** a test level and it
proves nothing about AutoCAD — see [`docs/verification.md`](docs/verification.md).

---

## Documentation

| Document | Contents |
|----------|----------|
| [`docs/architecture.md`](docs/architecture.md) | Layers, responsibilities, hard separation rules, state model |
| [`docs/installation.md`](docs/installation.md) | Prerequisites, manual install, npx installer, uninstall |
| [`docs/configuration.md`](docs/configuration.md) | `opencode.json` wiring, MCP server config, configuration safety |
| [`docs/development.md`](docs/development.md) | Repo structure, test levels, versioning, change management |
| [`docs/verification.md`](docs/verification.md) | Verification limits, geometry read-back gate, level status |
| [`CHANGELOG.md`](CHANGELOG.md) | Released changes, semver classes, compatibility notes |
| [`installer/npm/README.md`](installer/npm/README.md) | Installer behavior, options, exit codes, safety rules (IMPLEMENTED) |

Every documented capability is marked **IMPLEMENTED** or **PLANNED**;
planned functionality is never presented as working.

---

## Roadmap

Realistic future work only — none of these are implemented yet:

- Live AutoCAD MVP validation (first end-to-end run against a real drawing)
- Geometry read-back capability, **only if** live testing proves it necessary
  (would be implemented in `autocad-mcp`, not in this skill, and only through
  the five-step gate in `docs/verification.md`)
- Additional engineering-specific worked examples
- Broader automated integration tests

---

## License

MIT — see [LICENSE](LICENSE).
