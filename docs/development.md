# Development

Status: **IMPLEMENTED** — how this repository is organized and how to change
it safely.

## Repository structure

```
.
├── skill/
│   └── engineering_agent/        ← the portable skill unit
│       ├── SKILL.md              ← entry point
│       ├── tool_contracts.md     ← real MCP interface documentation
│       ├── skill.json            ← version manifest
│       ├── workflows/            ← 7 project-intent workflows
│       ├── rules/                ← reusable behavior constraints
│       ├── schemas/              ← project memory JSON schemas
│       ├── templates/            ← blank memory templates
│       └── examples/             ← worked example project
├── installer/npm/                ← npx distribution layer (install/update/doctor/version)
├── tests/
│   └── validate_skill.py         ← Level 1 static validation
├── docs/                         ← architecture, install, config, dev, verify
├── README.md
├── CHANGELOG.md
├── LICENSE
├── .gitignore
└── opencode.example.json         ← placeholder wiring template
```

Rules:

- **Skill content stays inside `skill/engineering_agent/`** — that folder is
  the unit that gets copied, versioned, and updated.
- Repo-level docs refer to skill files with repository-root paths;
  skill files refer to each other with skill-relative paths.
- `autocad-mcp` is an external sibling checkout — never add it to this
  repository.

## Test levels

| Level | Scope | Where | How to run |
|-------|-------|-------|------------|
| 1 — Static skill validation | File refs, tool refs, parameter refs, forbidden patterns | this repo | `python tests/validate_skill.py` |
| 2 — Offline MCP tests | MCP server behavior without AutoCAD | external autocad-mcp checkout | `python -m unittest` in that checkout (documented there) |
| 3 — MCP wiring | OpenCode discovers the skill and starts the MCP server; tool discovery | OpenCode session | Start OpenCode, confirm the skill is advertised and tools are listed |
| 4 — Live AutoCAD | Real operations, screenshots, save/reopen, continue, modify, verify | OpenCode + AutoCAD | Manual live test procedure with a drawing open |

**Never report Level 4 as passed unless real AutoCAD was tested.** Current
status of each level: `docs/verification.md`.

## Installer test suite — IMPLEMENTED

The npm layer has its own tests, separate from the four levels above:

```powershell
cd installer/npm
npm test
```

They use Node's built-in test runner with no dependencies: 60 tests covering
the default global install target and `--local`, migration from the old
undiscovered location (copy first, validate, refresh what the user never
touched, preserve what they did, then confirm before removing), the skill ID
and frontmatter discovery requirements, install detection,
dry-run, config preservation, local-modification detection, a user-added file
surviving consecutive updates, update
confirmation, rollback, doctor output — including the `skill` permission —
and invalid environments.

`scripts/smoke.js` is a separate check of the package a user would actually
download: run `npm pack`, then `node scripts/smoke.js [path/to.tgz]`. It
installs the tarball offline into a throwaway prefix under the OS temp folder
and drives the installed binary against throwaway homes — 49 checks, including
the migration path.

Every test runs against a throwaway directory in the OS temp folder with its
own `AUTOCAD_SKILL_HOME`, so no test can read or write the repository, your
real OpenCode project, or this machine's `~/.config/opencode` and
`~/.opencode`. `AUTOCAD_SKILL_SOURCE` defaults to the repo skill folder in
tests so a stale `installer/npm/skill/` build artifact left by an earlier
`npm pack` can never shadow the current sources.

## Changing the skill

1. Edit skill files inside `skill/engineering_agent/`.
2. Run Level 1 validation — it must pass (0 violations).
3. If MCP tools or parameters changed: inspect the actual server first
   (names, parameters, outputs), then update `tool_contracts.md` —
   **never invent tools**; the skill adapts to the real interface.
4. If behavior changed: classify the change (see below) and add a
   `CHANGELOG.md` entry.
5. For structural changes: produce a change proposal and get explicit
   approval before touching files.

## Versioning — IMPLEMENTED

`skill/engineering_agent/skill.json` holds the skill version; `CHANGELOG.md`
records every released change.

- **PATCH** — documentation, typo, wording, non-behavioral fixes.
- **MINOR** — backward-compatible new workflow/rule/capability.
- **MAJOR** — breaking behavioral or structural changes.

The npm package carries its own, separate version in
`installer/npm/package.json`. It does not move together with the skill: the
skill is 0.1.0, the installer is 0.2.0, and the tool contract version is 1.
`autocad-skill version` prints all three.

Update policy — now enforced in code by the installer rather than by
discipline alone: never silently overwrite a customized local skill — detect
the installed version, compare, show what changes, detect local
modifications, require explicit confirmation before applying anything that
can change agent behavior, and keep a backup that `update --rollback` can
restore.

## Confirmation policy

Any change that can alter agent behavior requires explicit user
confirmation before it is applied. Documentation-only changes are less
critical but the default stays conservative.
