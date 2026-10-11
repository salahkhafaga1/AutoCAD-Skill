# P1 CAD Integration Plan — Reference Lookup Inside Engineering Workflows

Status: **APPROVED AND IMPLEMENTED 2026-10-11.** Built as specified;
as-built note appended in §6.

Parent plan: `docs/reference-system-plan.md` §10 (future integration
design). P0.1–P0.4 are implemented and verified; this plan consumes
their artifacts (manifests, page indexes, search CLI, doctor checks,
user guide) without changing any of them.

## 1. Scope

### 1.1 In scope

- One new rule file, the reference lookup rule described in §3,
  governing when the agent consults the local library, how evidence is
  handled, and what MUST NOT be claimed.
- Minimal hooks: one UNDERSTAND-loop step in `SKILL.md`, reference
  assists in `requirement_rules.md` Steps 1/3/6, and an evidence block
  convention for requirements presentation.
- Optional citation fields on project-memory records (decisions,
  assumptions, constraints): reference id plus page, backward-compatible
  additions to three schemas and three templates.
- A worked citation example inside `examples/simple_room/` showing an
  evidence-backed requirement (docs only, no behavior change).

### 1.2 Out of scope (non-goals)

- No new MCP tools; search stays a local command run, never a tool call.
- No risk-table changes: lookup is read-only (GREEN by the existing
  definition, like queries); citing a passage never substitutes for a
  RED approval and never downgrades one.
- No stop-condition changes: Category G (professional judgment) keeps
  full force; references inform, never override.
- No OCR, no semantic search, no verification-geometry changes.
- No changes to `tool_contracts.md`, the 29-tool surface, installers,
  packaging, or versions.

## 2. Integration points (exact files)

1. `SKILL.md` master loop, UNDERSTAND branch: after ambiguity
   detection, one conditional step — "If the request involves a named
   standard, code, clearance, or dimension the user did not fully
   specify, consult the local library per the new reference rule;
   if no library is configured, proceed exactly as today."
   Plus one entry in the References section pointing at the new rule
   file and `docs/references.md`.
2. `rules/requirement_rules.md`: Step 1 gains `regulation` and
   `standard` as first-class sources with citation shape
   (`Source: regulation — REF-ID p.N`); Step 3 ambiguity responses may
   cite a retrieved passage as one option among explicitly asked
   choices (never as the decision); Step 6 confirmation gains an
   Evidence block (passages with method/confidence, uncertainties
   spoken aloud).
3. The new reference rule (content outline in §3).
4. Schemas `decision`, `assumption`, `constraint`: one optional
   `citation` object each (`ref_id` string, `page` integer-or-null,
   `method` string, `confidence` string). Optional means every existing
   file stays valid.
5. Templates for the same three records: matching optional citation
   lines with a one-line comment that fabrication voids the record.
6. `examples/simple_room/`: one cited requirement plus its evidence
   block, demonstrating the convention end to end.

## 3. New rule file outline

- **When to search:** named codes/standards, clearances, minimum
  dimensions, material or system selections the user left open, and any
  "standard X says" claim needing a source. Never for pure geometry
  the user fully specified; never as a substitute for asking about
  project-specific unknowns (site dimensions, placements).
- **How to run it:** the repository search command with explicit
  `--lib` roots from the runtime environment, `--ref` pinning when
  the discipline is known, `--json` for machine-readable hits.
  Command spelled as a shell invocation with flags, never as a bare
  tool-style call (the Level 1 validator forbids tool-shaped spellings
  inside `skill/`).
- **Degradation:** library absent, index missing, source unavailable,
  or no reliable match → record "no reference evidence" and continue
  the existing workflow unchanged. Reference failures MUST NOT block,
  corrupt state, or invent passages (§8.5 of the parent plan).
- **Evidence handling:** verbatim excerpt separated from agent
  interpretation; method tag, confidence, and flags repeated with every
  use; `low`/`unverified` passages presented with their limits spoken
  aloud; partial-source hits carry the partial flag.
- **Prohibitions:** no code-compliance verdicts ("complies with X"
  stays a RED professional-judgment stop); no dimensional verification
  claims from text passages (geometry evidence rules unchanged); no
  OCR engine installation or naming inside skill files; no citing
  handbooks as mandatory codes (the §5.7 label travels with every
  compliance-adjacent hit); no page/section numbers beyond what the
  hit record contains.
- **State recording:** cited requirements store the citation object;
  uncited defaults stay assumptions with confidence, exactly as today.

## 4. Wording constraints (binding on the implementation task)

The Level 1 validator scans every `skill/**/*.md` file. The new and
edited files MUST: avoid MCP-tool-shaped `name(` spellings (spell the
search as a flagged shell command); avoid naming OCR engines anywhere
under `skill/`; avoid pipe-separated backticked token lists; avoid
uppercase backticked workflow paths that do not exist; keep every
`workflows/`, `rules/`, `templates/`, `schemas/`, `examples/` cross-link
pointing at a real file. The implementation task re-runs the
validator and ships only on PASS, 0 violations.

## 5. Risk, stop, and verification analysis (no changes required)

- Lookup performs no mutation and touches no drawing: GREEN under the
  existing table, same row as queries. No table edit needed.
- Every safety-relevant use (structural placement, life-safety
  dimensions, code compliance) already terminates at an explicit human
  approval or a Category G stop. The design adds evidence to those
  gates; it does not move, weaken, or bypass any of them — hence no
  `risk_rules.md` or `stop_conditions.md` edits.
- Geometry verification is untouched: passages inform *requirements*
  (what value to use), never *measurements* (whether the drawing
  matches). `verification_rules.md` needs no edit.

## 6. Tests and acceptance

- Level 1 `validate_skill.py`: PASS, 0 violations (covers the new rule
  file, edited cross-links, schema JSON validity, and the §4 wording
  constraints).
- Secret audit: CLEAN.
- Installer suite 91/91 unchanged (nothing installer-side is touched).
- Schema backward compatibility: existing `simple_room` memory files
  validate with the extended schemas (additive optional fields only).
- Worked example renders a complete evidence block with method,
  confidence, page, and an explicit uncertainty line.
- `skill/` diff review: additions confined to §2 items 1–6; no
  workflow semantics altered (hooks add an optional lookup, never a
  required one).

## 7. Risks carried openly

- Agents may overweight retrieved numbers: contained by the
  no-verdict rules, RED gates, and spoken-uncertainty convention —
  but prompt-layer discipline is inherently softer than code; the
  worked example exists to set the pattern, not to enforce it.
- Stale or partial indexes produce weak evidence: the degradation
  rule plus `doctor` index states are the mitigation; P1 adds no new
  index machinery.
- Scope creep into RAG/OCR/table parsing: explicitly parked (parent
  plan §1.2, §6.7); any of those restarts at a new proposal, not as
  a quiet extension of this one.

## 8. What approval covers (nothing below is approved)

- The six file changes in §2 (one new rule, two hook edits, three
  schema/template pairs, one example addition).
- The §3 rule content and the §4 wording constraints as acceptance
  gates.
- Permission to edit skill files at all (first behavioral-layer change
  since the reference track began), working tree only, no
  commit/publish/version changes.

## 6. As-built notes (implementation record)

- Built exactly per §2: new reference lookup rule, SKILL.md
  UNDERSTAND hook plus references entry, requirement-rule hooks
  (Steps 1/3/6 with Evidence block), optional `citation` objects on
  the decision/assumption/constraint schemas and templates (required
  field lists untouched — every existing memory file stays valid),
  and a cited REQ-006 with full evidence block in the simple_room
  example. No `risk_rules.md`, `stop_conditions.md`,
  `verification_rules.md`, `tool_contracts.md`, installer, or version
  changes, as designed.
- Verification: Level 1 validation PASS with 0 violations (covers the
  new rule file and all edited skill files), secret audit CLEAN (136
  files), installer suite 91/91 unchanged, all three schemas still
  valid JSON.
