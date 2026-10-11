# P0.3 + P0.4 Implementation Plan — Search MVP and Validation Hardening

Status: **APPROVED AND IMPLEMENTED 2026-10-11.** As-built notes appended
in §6; everything else below was implemented as specified.

Parent plan: `docs/reference-system-plan.md` (§6 search, §8 validation,
§9 distribution, §11 phases). P0.2 is implemented and verified
(`docs/reference-p0.2-proposal.md` §15); this plan assumes its artifacts
(`inspect.json`, `pages.jsonl`, `doc.json`) and schemas as fixed inputs.

Order: P0.3 first, then P0.4 (P0.4 hardens everything P0.3 adds).
Neither phase touches `SKILL.md`, workflows, rules, CAD behavior,
`autocad-mcp`, package versions, or the three reference PDFs.

---

## 1. P0.3 — Local keyword search MVP

### 1.1 Tool and placement

New file `tools/ref_search.py`, standard library only (no new
dependency, no venv requirement — system Python runs it). It reads P0.1
manifests and P0.2 page indexes; it never opens PDF files. CLI shape:

```text
python tools/ref_search.py --query "door clearance" [--ref ID]
  [--global-only | --project-only] [--context 0|1] [--limit 10] [--json]
```

Exit codes follow the existing Python-tool convention: 0 results or
clean no-match, 1 runtime failure, 2 usage error. Missing indexes and
unavailable sources warn on stderr and never fail the run.

### 1.2 Retrieval semantics (fixed, explainable)

- Normalization: casefold plus whitespace collapse. Tokenizer uses
  Unicode word characters, so Arabic-script queries match Arabic text
  without a dedicated analyzer; P0.3 matching is exact-form (no
  stemming — recorded limitation, same as the parent plan).
- Page-level token AND across the query terms; score is term-frequency
  summed per page times per-term rarity computed inside that reference
  (log of one plus page-count over document-frequency). No cross-corpus
  statistics, no embeddings. Ties break by reference id then page.
- Scope: both libraries by default, project hits rank before global
  hits; `--ref` narrows to one id. Duplicate ids across scopes without
  an explicit `--ref` refuse those hits with a named message — the
  never-silently-resolve rule applies to search exactly as to discovery.
- Context: `--context 1` appends the neighboring pages labeled
  `context`, never as hits. Default 0.
- Sections: the page `section` field when the index carries one (see
  §1.3), else a clearly labeled heuristic guess from heading-like lines
  (numbered headings, all-caps lines). Heuristic sections are marked
  `heuristic` and MUST NOT be cited as document structure.

### 1.3 Small additive extraction change (only P0.2 code touch in P0.3)

`tools/ref_extract.py` gains optional outline capture: when the PDF
provides a bookmark/outline tree, page numbers are mapped to section
titles into the existing `section` field of new page records.
Null otherwise. Old indexes without sections stay fully searchable —
nothing is re-extracted unless the user wants sections. Rationale:
scanned books (R2/R3 era) frequently have no usable outlines, so
search MUST NOT depend on this; it is a bonus signal with a null-safe
fallback, covered by its own synthetic test.

### 1.4 Output contract

Human output by default; `--json` emits a versioned envelope
(`schema: 1`) with one record per hit: reference id, origin scope,
page, folio-or-null, section-or-null, method tag, confidence,
review status, and a ~500-character excerpt centered on the first
match and trimmed at word boundaries. No interpretation field is ever
printed — excerpts are evidence; interpretation stays the agent's job.
Every hit repeats its method tag inline (`direct-text`,
`legacy-ocr-layer`, `ocr`, `manual`), and partial-source hits carry
the partial flag. No reliable match prints an explicit no-match
statement naming the terms plus the scopes and indexes consulted —
never a confabulated answer.

### 1.5 P0.3 tests (new file `tests/test_ref_search.py`, stdlib runner)

Hand-written synthetic index fixtures in temp dirs (manifest plus
`pages.jsonl`/`doc.json` authored directly — no PDF parsing in the
search tests): ranking order on a controlled term distribution; AND
semantics excluding partial-term pages; method/confidence passthrough
on every record; context pages labeled and never ranked; JSON envelope
schema conformance; no-match message content; missing-index warning
with exit 0; unknown `--ref` exit 2; cross-scope duplicate ids refused
without `--ref` and resolved with it; heuristic sections labeled and
real sections preferred. Regression in the same run: P0.2 tool tests,
full installer suite, Level 1 validation.

### 1.6 P0.3 acceptance (all required)

- Search over hand fixtures returns the documented ranking with all
  labels intact; `--json` validates against the envelope description.
- Search over the real local R2/R3 indexes finds known terms from the
  audit samples and reports method `legacy-ocr-layer` with `low`
  confidence; R1 queries report no text hits with the reason stated
  (image-only source, OCR off) — recorded, not asserted as fixed strings.
- No new dependency installed; system Python runs search; skill,
  installer, and validator behavior unchanged.

## 2. P0.4 — Validation hardening and user docs

### 2.1 `doctor` index-status reporting (installer, read-only, warnings only)

Pure functions in `installer/npm/lib/references.js` plus output lines in
the existing Reference library section: for each manifest entry whose
file is available — index `fresh` (doc record exists, SHA-256 matches,
extractor version matches the installed tool record), `stale`
(hash or version differs), `missing` (no record), plus `orphaned`
(records with no manifest entry). Orphan listing is read-only
enumeration, not the deferred unregistered-file policy (no new files
are absorbed or suggested for absorption). Installer tests cover each
state with temp-dir fixtures; the P0.1 suite count grows accordingly
and the documented counts are updated in the same change.

### 2.2 Level 1 validator references module (`tests/validate_skill.py`)

New checks, all offline and hermetic: `references.json` fixtures under
`tests/fixtures/` validate against the registry schema when present;
assert no `.index/` directory is committed anywhere under the repo;
extend the forbidden-pattern list with reference-specific entries —
install instructions for OCR engines inside `skill/`, MCP-tool-shaped
spellings of the search utility name inside `skill/`, and committed
`.index/` paths. Acceptance is the existing gate: result PASS with
zero violations.

### 2.3 Packaging guard (`installer/npm/scripts/prepack.js`)

Findings from inspection: the current denylist covers `node_modules`,
`__pycache__`, `.venv` (exact — `.venv-ref` NOT covered), `.git`,
log/pycache extensions, and dotenv files, and only warns. P0.4 moves
the denylist matcher into a testable `lib/packcheck.js` pure function,
extends it with reference-content patterns (`.pdf`, `.index/`,
`references.json`, `.venv-ref/`), and makes reference-content matches
fail the pack with exit 1 while existing entries keep warn-only
behavior. `installer/npm/test/` gains fixture tests for the pure
function against temp trees (no real pack run needed). Rationale for
the split severity: failing the whole pack on a stray `node_modules`
would be a new behavior break; failing on copyrighted reference
content is the point of the safeguard.

### 2.4 User guide (`docs/references.md`, new)

Library setup for both scopes, registering files (including a local
R1–R3 example with the user's own paths — never the author's paths),
relative vs `external` absolute paths and portability consequences,
the §9.4 warning texts, troubleshooting (missing/inaccessible,
duplicate ids, stale indexes), and the standing statements: no OCR in
P0, indexes are local regenerable caches, originals are never moved.
This is the document the P0.3/P0.4 warnings point users to.

### 2.5 Test-hygiene fixes folded into P0.4

- The Windows drive-letter test gets a non-Windows skip guard (known
  P0.1 review finding).
- New installer tests use the same throwaway-home/project conventions;
  no test reads the real `D:\AI\skill\Ref` files or the real machine
  home; Python tool tests keep synthetic-only fixtures.

### 2.6 P0.4 acceptance (all required)

- `doctor` reports fresh/stale/missing/orphaned correctly on fixtures;
  absent libraries and missing optional tooling stay non-fatal.
- Level 1 validation PASS with the new references module active.
- A simulated pack-tree containing a PDF and an `.index/` fails via
  the pure-function test; the real `npm pack --dry-run` file list
  contains no PDF, index, manifest, or venv paths.
- User guide present and linked from the installer README troubleshooting
  area; secret audit CLEAN; full installer suite plus both Python suites
  green; `skill/` diff empty.

## 3. Sequencing and effort shape

P0.3 then P0.4, strictly sequential: P0.4's validator patterns and
doctor lines assume the search tool's final naming and output contract.
Expected touch list — P0.3: one new tool, one additive extractor
option, one new test file. P0.4: one new lib module plus doctor wiring,
one validator module, one prepack refactor, one user doc, test-count
updates. No new dependencies in either phase; no version bumps; no
commits without a separate instruction (working-tree changes only,
as in P0.1/P0.2).

## 4. Risks carried openly

- Outline capture depends on the pinned library's outline API behaving
  uniformly; if a real file's outlines prove unusable, sections stay
  null and search degrades to the heuristic — specified fallback, not
  a failure.
- Heading heuristics will mislabel some lines; the `heuristic` tag plus
  the never-cite rule contain the damage.
- JSONL scale is proven only up to the R3 size at P0.2 runtimes;
  P0.3 records its own timings and degrades by streaming, never by
  loading whole indexes for builds it does not perform (search reads
  page records it scores — paging/limit discipline is part of the
  implementation task).
- The npm test-count strings move again with P0.4 tests; updating all
  of them in the same change is an explicit checklist item so the
  P0.1/P0.2 staleness episode does not repeat.

## 5. What approval covers (approved and implemented 2026-10-11)

- P0.3 scope, CLI shape, scoring semantics, output contract, and the
  single additive extractor change in §1.3.
- P0.4 scope: doctor index states, validator module, prepack fail
  behavior with warn-only preservation for existing entries, user
  guide, and test-hygiene fixes.
- Permission to create the listed new files and edit the listed
  existing files, working tree only, no commit/publish/version changes.

## 6. As-built notes (implementation record)

- P0.3 built as specified: `tools/ref_search.py` (stdlib-only),
  outline capture in `tools/ref_extract.py` (old indexes stay valid —
  `section` defaults null), `tests/test_ref_search.py` (15 tests,
  system-Python runnable). One behavior addition from testing: unknown
  `--ref` exits 2 instead of searching nothing. Recorded search
  acceptance on real local indexes: audit terms found with
  method/confidence/flags intact (including a heavily garbled Neufert
  OCR page correctly labeled `low`); R1-only queries report clean
  no-match naming the consulted index; `--json` envelope schema 1
  verified with all specified keys.
- P0.4 built as specified: `installer/npm/lib/packcheck.js` pure
  matcher (reference patterns fail, historical warn), prepack refactor
  to use it, `doctor` fresh/stale/not-built/orphaned lines (warnings
  at most), validator [5] references module plus `tests/fixtures/
  manifest-good.json`, `docs/references.md` user guide, drive-letter
  test skip guard. Installer suite 91/91; Level 1 PASS; secret audit
  CLEAN. No `skill/` diff; no version bumps; no commits.
