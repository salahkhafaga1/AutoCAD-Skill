# Engineering Reference System — P0 Plan

Status: **PLANNED** — design only. Nothing in this document is implemented.
No code, configuration, workflow, rule, schema, template, installer behavior,
or package content changes on the basis of this plan until each item is
separately approved and implemented.

This plan was audited against the three real reference files in
`D:\AI\skill\Ref` (outside this repository) using stdlib-only local
inspection. No OCR was run, no packages were installed, no file was moved,
renamed, modified, uploaded, or copied into this repository. Findings are in
§2; methods and their limits are stated there.

Conventions: **P0** = must exist before the reference system is usable.
**P1** = later phase. **IMPLEMENTED** = works today elsewhere in this repo
and is reused unchanged. **PLANNED** = designed here, not yet built.
**[DECISION Dn]** = blocked on explicit user approval (see §12).

---

## 1. Scope and explicit non-goals

### 1.1 P0 scope

1. A local reference library with two roots: one **global (user-level)**,
   one **project-local** (§7).
2. A manifest-based registry: deterministic discovery, ID resolution,
   duplicate/conflict/missing-file detection (§2 of architecture, §7).
3. Document ingestion with **per-page** extraction status: direct text
   extraction where possible, image-page detection where not, OCR as an
   explicitly separate optional step (§3, §4).
4. Page-anchored citation metadata for everything retrieved (§5).
5. Local keyword search MVP over extracted page text (§6).
6. Validation split across validator / `doctor` / indexing (§8).
7. Privacy and distribution safeguards so reference contents can never leak
   into git or the npm package (§9).

### 1.2 Non-goals (P0 explicitly excludes)

- No embeddings, vector database, semantic search, or RAG pipeline.
  Keyword search is the MVP; §6.7 leaves a documented extension path.
- No mandatory OCR. OCR is optional and off by default (§4).
- No changes to `SKILL.md`, workflows, rules, schemas, templates,
  examples, CAD execution behavior, `autocad-mcp`, or OpenCode
  configuration. §10 is a **future integration design only**.
- No new runtime dependency in the core skill or the npm installer.
  The installer stays zero-dependency. Any PDF/OCR tooling lives in an
  optional local Python utility layer (§4.5, [DECISION D1]).
- No bundling, moving, or copying of the three reference PDFs.
  Originals stay where they are; the system only reads them (§9.1).
- No code-compliance claims. The system retrieves passages; a professional
  decides compliance (see §5.8, §10.8).

### 1.3 Prior state (Phase 1 finding)

No Engineering Reference System plan existed in this repository before this
document (repository-wide search for `reference-system`, `pypdf`, `OCR`,
`tesseract`, `citation`, `reference library`, `RAG`, `embedding`,
`full-text search`: zero matches). All §A–§I requirements from the audit
brief were therefore **FAIL (missing)**. This document is the correction;
each gap is closed by the section cited in §11.

Pre-existing project facts this plan relies on (all verified in-repo):

- Skill unit: `skill/engineering_agent/` (`SKILL.md`, `tool_contracts.md`,
  `skill.json` id `engineering-cad`, 7 workflows, rules, schemas,
  templates, worked example). Unchanged by this plan.
- Test levels per `docs/development.md` / `docs/verification.md`:
  Level 1 `tests/validate_skill.py` (static), Level 2 offline MCP tests
  (external repo), Level 3 wiring, Level 4 live AutoCAD (PENDING).
- Installer `autocad-skill` (npm, zero dependencies): install / update /
  rollback / doctor / version; default global target
  `~/.config/opencode/skills/engineering-cad`; `AUTOCAD_SKILL_HOME`
  override convention for tests; config preservation rules in
  `docs/configuration.md`.
- Packaging: `installer/npm/package.json` `files` =
  `bin, lib, skill, README.md, CHANGELOG.md, LICENSE`; prepack
  regenerates `installer/npm/skill/` from the repo skill folder;
  `tests/secret_audit.py` (skips binary extensions incl. `.pdf`;
  scans text files ≤ 2 MB).
- Working tree at audit time: `git status --porcelain` clean; local
  branch `main` ahead of `origin/main` by 4 commits (unpushed, not
  uncommitted changes). This plan adds exactly one file
  (`docs/reference-system-plan.md`); nothing else is touched.

---

## 2. Reference inventory (measured, 2026-10-11)

Method (stdlib only, read-only): file sizes from the filesystem; PDF
header / trailer / `/Encrypt` / object census (`/Type /Page`, `/BaseFont`,
`/ToUnicode`, `/Subtype /Image`, filter names, `/ObjStm`) by byte-pattern
scan; evenly-spaced stream sampling with `zlib` decompression counting
`BT` / `Tj` / `TJ` / `Do` operators; literal-string sampling from `Tj`
operands; `/Info`-dict metadata strings; one JPEG page image carved by
`DCTDecode` stream boundaries and viewed. **No PDF library, no OCR engine,
no text-extraction run beyond reading the files' own embedded text
layers.** Page counts were triangulated at audit time; exact catalog
counts are now VERIFIED by Tier-1 page-tree reads (see per-file notes):
445 / 640 / 1297.

| # | Filename | Size | Type | Pages (Tier-1 verified) | Content class |
|---|----------|------|------|----------------------|---------------|
| R1 | `ECP203-2025-compressed.pdf` | 18,271,869 B (~17.4 MB) | PDF 1.7, unencrypted, `%%EOF` OK | 445 (audit estimate ~444–445 confirmed) | **Scanned / image-only** |
| R2 | `Neufert.pdf` | 58,878,226 B (~56 MB) | PDF 1.6, unencrypted, `%%EOF` OK | 640 (audit triangulation confirmed; page objects live in compressed object streams) | **Searchable-image (legacy OCR layer) + scanned figures** |
| R3 | `Time-saver Standards for Building Types.pdf` | 198,148,632 B (~189 MB) | PDF 1.4, unencrypted, `%%EOF` OK | 1297 (resolves the audit's 1297-vs-984 signal in favor of 1297) | **Searchable-image (legacy OCR layer) + scanned figures** |

Per-file evidence:

- **R1 ECP203:** 0 embedded fonts, 0 `/ToUnicode`, 0 `Tj`/`TJ` operators
  across all 2,225 decompressible streams; every content stream is
  full-page image painting (`/Im0 Do`, `/Im1 Do`); 444 JBIG2 bilevel +
  889 DCT/JPEG images (~2 color/gray + 1 bilevel per page — the
  "compressed" in the filename). No `/Info` title/author found.
  **Requires OCR for any machine-readable text.** Document language,
  title, author, and edition are NOT VERIFIED from content (filename
  suggests a 2025 code document). Script observed: a sampled R1 figure
  carries Arabic-script table labels (visually confirmed 2026-10-11), so
  OCR-phase planning MUST include the Arabic pack alongside English;
  full language survey and bibliographic identity stay unverified until
  the OCR phase.
- **R2 Neufert:** Creator `Acrobat 4.0 Scan Plug-in for Windows`,
  Producer `Adobe Acrobat 9.0 Paper Capture Plug-in`, CreationDate 2001,
  ModDate 2010 — a ~2001 scan with Adobe's OCR ("Paper Capture") text
  layer. Bulk text present: 352,727 `Tj`/`TJ` ops, ~12.6 M ASCII
  characters across ~640 streams. Sampled literals are coherent English
  index text, e.g. `(Surgical ) (departments ) (and ) (surgeries, )
  (551-2, )`. Only 1 `/BaseFont`, 2 font descriptors, **0 `/ToUnicode`
  maps** — encoding-failure risk on some glyphs. 638 bilevel page images
  under the text. Tables, dimensioned drawings, and symbols are image
  regions: extractable text will NOT faithfully represent them.
- **R3 Time-Saver:** Creator/Producer `OmniPage 11`, CreationDate 2002 —
  a 2002 ScanSoft-OCR searchable scan. Bulk text present: 809,738
  `Tj`/`TJ` ops, ~15.2 M ASCII characters across ~1,271 streams.
  Sampled literals are coherent English, incl. title matter
  (`Time-Saver Standards Building Types Second Edition … JOSEPH …`) with
  typical legacy-OCR artifacts (`Baumeisterand` — missing word space).
  Only 22 `/ToUnicode` maps for 257 `/BaseFont` entries — **large
  portions may extract as wrong/missing glyphs**. 2,593 JPEG images
  (~2/page: page scans + figures). Carved cover JPEG visually confirmed:
  photographed book cover (spine + plastic glare visible) —
  `TIME-SAVER STANDARDS FOR BUILDING TYPES, 2nd Edition,
  JOSEPH DE CHIARA & JOHN CALLENDER, McGraw-Hill International Editions,
  Architecture Series`. Interior tables/figures/drawings are scanned
  images; multi-column reference layouts will interleave under naive
  extraction (index-style multi-entry content directly observed).

Classification against the brief's four cases:

1. Pure text-based PDF: **none** of the three.
2. Scanned/image-based (OCR required): **R1**.
3. Mixed (extractable text + image pages/regions): **R2, R3**
   (per-page text on ~all sampled pages, but figures/tables/drawings are
   images and legacy OCR fidelity is unverified).
4. Complex technical content where plain text is unfaithful (tables,
   equations, drawings, symbols, spatial relationships, multi-column
   order): **all three** (R1 entirely; R2/R3 for their image regions and
   layouts).

What was NOT inspected (explicit limits): render fidelity of any
individual content page; per-page OCR-error rates; table/equation
reconstruction quality; bookmark/outline trees; R1's language and
bibliographic identity. These become indexing-time checks and
implementation-time sampling tasks (§8), not assumptions.

---

## 3. PDF inspection and extraction strategy

### 3.1 Two-tier pipeline (P0)

- **Tier 0 — stdlib pre-check (zero dependencies, always runs).**
  Header/trailer/`%%EOF` sanity, `/Encrypt` detection, object census,
  stream sampling exactly as performed in §2. Output: `inspect.json`
  per file (page-count estimate + method, encryption flag, font/image/
  filter census, text-layer presence verdict). Purpose: fail fast on
  corrupt/encrypted/empty files and route each file to the right tier-1
  path without any third-party code.
- **Tier 1 — text extraction (optional local utility, [DECISION D1]).**
  Per-page text with page numbers preserved; per-page status
  (§3.3); tables/figures flagged, never silently flattened.

### 3.2 Per-page content classification

Every page gets exactly one label, stored in the index:

- `text` — decompressible content with ordered `Tj` output above a
  minimum character threshold (threshold defined in implementation,
  recorded in index metadata).
- `image` — no text operators; page paints only images (R1 pattern).
- `mixed` — text plus significant image regions (R2/R3 pattern:
  text layer + figure/table scans).
- `empty` — neither (blank page) · `failed` — extraction error recorded
  with the exception class · `skipped` — encrypted/unparseable (reason
  recorded; password-protected files are NEVER cracked — reported as
  `skipped/encrypted`).

### 3.3 Extraction record (per document AND per page)

Document level: SHA-256 of file, byte size, page-count estimate +
method, extractor name + version + settings, timestamps, overall
status, error list. Page level: `page_number` (1-based PDF order AND,
where detectable, printed folio — both stored, PDF order is canonical),
class label (§3.2), character count, extraction method
(`direct-text`, `ocr`, or `manual`), warning flags
(`no-tounicode`, `legacy-ocr-layer`, `large-image-region`,
`multi-column-suspect`). Reprocessing rule: any change to extractor
name/version/settings invalidates stored pages (version field mismatch
→ re-extract; unchanged SHA-256 + same extractor version → skip).
Duplicate detection: identical SHA-256 under two paths = same document
→ single registry entry with both paths noted, never double-indexed.

### 3.4 Technical content handling (P0 honest limits)

- Tables/equations/drawings/symbols in image regions: indexed as
  `figure` blocks with page + caption-if-extractable + `manual-review`
  flag. P0 does NOT reconstruct tables from text or parse drawings.
- Multi-column layouts: stored reading order is marked `order-unverified`
  unless the extractor's layout mode was used AND a human/sample check
  passed; search snippets carry the flag so citations don't imply false
  contiguity.
- `no-tounicode` fonts (R3 pattern: 22 maps / 257 fonts): affected
  pages get `encoding-suspect`; implementation must sample-verify such
  pages against rendered images before their text is citable.
- Legacy OCR layers (R2/R3: 2001/2002 engines) are treated as
  **untrusted-but-useful**: searchable, citable only with
  `method: direct-text (legacy-ocr-layer)` + confidence `low` until
  spot-checked (§5.6).

### 3.5 Empty / corrupt / encrypted / unsupported / partial

`empty` (0 extractable pages and 0 images) → registered, indexed as
empty, warning issued. Corrupt (bad header, missing `%%EOF`, stream
errors on all pages) → `failed` with reason, never retried silently.
Encrypted → `skipped/encrypted`, user told the file needs an
unprotected copy. Partial (some pages fail) → indexed with per-page
`failed` entries; document status `partial`, and every search hit from
it carries the partial flag. Unsupported (non-PDF, PDF portfolios,
XFA forms) → `skipped/unsupported` with reason.

### 3.6 Storage of generated artifacts

Per library root: `<lib>/.index/<ref-id>/` containing `inspect.json`,
`pages.jsonl` (one record per page: page number, class, method, text or
`figure` placeholder, flags), and `doc.json` (registry metadata +
extraction record). `.index/` is a regenerable cache: deleting it loses
no user data (originals untouched) and triggers re-indexing. Rationale
for JSONL: appendable per page, streamable for 1,297-page documents,
diffable, no database.

---

## 4. OCR strategy and dependency decision gate

### 4.1 Options compared

| Option | What it does | Advantages | Limitations | OS/install/maintenance | Privacy | Fit for this project |
|--------|--------------|-----------|-------------|------------------------|---------|----------------------|
| **O0. Direct extraction only (no new deps)** | Tier-0 stdlib scan + read embedded text layers with the chosen PDF lib (§4.4) | Zero install; covers R2/R3 bulk text; deterministic | R1 yields nothing; figures/tables stay opaque; legacy-layer errors persist | None | Fully local | **P0 default. Always available.** |
| **O1. Tesseract (local, optional)** | OCR for `image` pages and flagged figure regions | Local (no uploads — required for copyrighted scans); 100+ languages incl. Arabic (`ara.traineddata` — relevant to R1, language TBD, [DECISION D7]); Apache 2.0; scriptable CLI | Separate install (~Windows installer via UB Mannheim, language packs selectable at setup or via `.traineddata` drop-in); LSTM quality on old/degraded scans and dense engineering tables needs human review; adds a version-pinned external tool to maintain | Windows installer + PATH; per-machine setup; pin version in index records | Fully local | **Recommended IF OCR is needed in P0 (R1 makes the case). Optional, off by default.** |
| **O2. Other local OCR (e.g. EasyOCR/PaddleOCR)** | Alternative neural OCR | Sometimes better on difficult layouts/tables | Heavy Python/GPU dependencies, larger maintenance surface, worse Windows-native story than a Tesseract binary | Higher install/maintenance cost | Local, but dependency weight | Rejected for P0; revisit only with measured evidence Tesseract cannot handle R1. |
| **O3. Cloud OCR APIs** | Upload-and-transcribe | Best raw accuracy on hard pages | **Unacceptable**: uploads copyrighted reference scans to third parties; credentials/billing; network dependency | N/A | Violates §9 | **Rejected. Never an option.** |
| **O4. Manual review/transcription** | Human reads difficult diagrams, equations, tables | Only reliable path for dense engineering figures | Slow; doesn't scale to whole books | None (process, not software) | Local | **Required complement**: P0 mandates manual review flags (§3.4), not full transcription. Targeted excerpts only. |

### 4.2 OCR decision gate (binding)

OCR stays **optional and off by default**. It activates per page/region
only when: (a) the page class is `image` or a `figure` block is flagged
`manual-review`, AND (b) the user explicitly enables OCR for that
reference (`ocr: true` in the manifest entry). OCR output is stored
with `method: ocr`, engine name + version + language packs recorded, and
confidence `low` until spot-checked. OCR is NEVER a silent fallback:
every OCR-derived passage is labeled as such in search results and
citations (§5.5). No OCR engine is installed, downloaded, or added as a
dependency by this task ([DECISION D3] to approve engine + packs).

### 4.3 OS / Windows notes

Tesseract's Windows path is a machine-level installer (UB Mannheim
builds for Tesseract 3/4/5) plus optional `ara` (and other)
`.traineddata` files; the Python utility calls the `tesseract` CLI as a
subprocess (no Python OCR binding required). `doctor` reports
`tesseract: present/absent (+ version, + installed languages)` as a
**warning**, never an error — the system works without it (§8.3).

### 4.4 PDF library decision — pypdf evaluation **[DECISION D1]**

**What `pypdf` can do** (verified against current docs via web search):
pure-Python, permissively licensed (BSD), a text-extraction routine with
`plain` and `layout` modes, metadata (`/Info` + XMP), page counts,
outline/bookmark reading, user-password decryption, image enumeration.
Small, stable, Windows-friendly (`pip install pypdf` into the existing
autocad-mcp-style venv pattern — but a *separate* concern, see below).

**What it cannot do:** OCR of any kind; table-structure reconstruction
(no table API — multicolumn/table pages degrade to wall-of-text; `layout`
mode preserves visual order approximately, not semantics); engineering
drawing/symbol interpretation; guaranteed reading order; reliable
extraction from `no-tounicode` fonts (the R3 pattern).

**Sufficiency against the three real files:** sufficient for R2/R3 bulk
text extraction with page numbers (their text layers are WinAnsi-grade
readable per §2 sampling); INSUFFICIENT for R1 (zero text — needs O1);
insufficient for tables/figures/drawings in all three (needs O4 flags +
optional O1). I.e. pypdf covers the "direct text" branch completely and
nothing else — which is exactly the branch P0 needs automated.

**Alternatives considered:** (a) **No new dependency**: stdlib-only can
census and sample (§2 proves it) but cannot produce faithful per-page
text (encoding, content-stream chaining, layout) — rejected as the
extraction engine, retained as Tier 0. (b) **PyMuPDF**: superior
extraction/rendering/images, but binary wheels + AGPL/commercial
licensing — licensing cost and packaging weight disproportionate to P0
needs. (c) **pdfplumber/pdfminer**: better table primitives, heavier and
slower, still no OCR; revisit if P1 table work is approved. (d)
`pypdf-table-extraction` (Camelot lineage): out of P0 scope per §1.2.

**Recommendation:** approve `pypdf` as an **optional local utility
dependency only** — used by repo-side reference tooling
(`tools/ref_index.py`, `tools/ref_search.py` — proposed, not created
here), installable via `pip install pypdf` into a throwaway or project
venv, never imported by the skill markdown, never added to the npm
package (which stays zero-dependency), never required for skill
operation. If rejected, fallback is O0-manual (user-supplied excerpts
with manual citations) — slower, still shippable.

### 4.5 Dependency placement rule (binding)

`SKILL.md` / workflows / rules / schemas: **no new dependencies, no
reference-tool calls in P0**. npm `files` array: unchanged. Python PDF
tooling (if approved): standalone scripts + a requirements-style pin
documented in the implementation task; `doctor` detects presence;
`validate_skill.py` gains only manifest/index consistency checks (§8.2),
never an import of the PDF library.

---

## 5. Metadata, evidence, and citation model

### 5.1 Registry entry (per reference, in `<lib>/references.json`)

```json
{
  "id": "ecp203-2025",
  "path": "ECP203-2025-compressed.pdf",
  "title": "…", "author": "…", "edition": "…", "year": 2025,
  "kind": "code | standard | handbook | manufacturer | educational | other",
  "jurisdiction": "…",
  "sha256": "…", "bytes": 0, "pages_estimate": 0,
  "ocr": false, "status": "indexed | partial | failed | skipped",
  "notes": "…"
}
```

`path` is relative to the library root whenever the file lives inside
it; absolute paths are allowed only for project-local entries and are
flagged `portable: false`. IDs are lowercase kebab-case, unique per
library; uniqueness is enforced across both libraries at resolution
time (§7.4). Seed values for R1–R3 (titles/authors/editions) are
entered ONLY from verified evidence (§2) — R1's bibliographic fields
start as `null` + `notes: "unverified — filename-derived"`.

### 5.2 Citation record (every retrieved passage carries all of)

`ref_id`, exact `filename`, `source_path` (library-relative or flagged
absolute), `title`, `author` (or `null`), `edition`/`year`/`jurisdiction`
where relevant, **`page` (PDF order; printed folio when known)**,
`section/clause` when verifiable (else `null` — never guessed),
`method` (one of `direct-text`, `legacy-ocr-layer`, `ocr`, `manual`),
`confidence` (one of `high`, `low`, `unverified`) +
`review_status` (one of `unreviewed`, `spot-checked`, `human-verified`),
and the verbatim `excerpt` (≤ ~500 chars) **visually separated from**
`interpretation` (agent's own words, always in a separate field —
never interleaved).

### 5.3 Confidence defaults (binding)

- Fresh direct-text extraction, `tounicode`-clean fonts: `high`.
- Legacy OCR layers (R2/R3 as shipped): `low` until spot-checked.
- Any OCR output: `low` until spot-checked.
- `encoding-suspect` / `order-unverified` pages: `unverified` until
  human-verified.
- Image figures without transcription: not citable as text at all —
  cited as `figure, p. N, manual review required`.

### 5.4 Missing-citation behavior (binding)

If page/section cannot be verified, the result says so verbatim
(`page: unverified`, `section: null`) and the passage is downgraded to
a lead ("found in <title>, location unverified — confirm before
relying"). Fabricating page numbers, quotations, editions, or clause
IDs is a validation failure (§8.2 forbidden-pattern class).

### 5.5 Method labeling in results

Search output always shows the method tag next to each hit
(`[direct-text]`, `[legacy-ocr]`, `[ocr: tesseract 5.x ara+eng]`,
`[manual]`), so downstream agents and users can weight evidence
without reading metadata.

### 5.6 Spot-check procedure (implementation-time)

For each reference: render N random text pages as images (any available
renderer on the implementing machine — method recorded, no new repo
dependency mandated), compare against extracted text, record
`review_status` + error classes observed (wrong glyphs, joined words,
column interleave). R3's `no-tounicode` pages and R2/R3 legacy layers
may not be cited above `low` before this passes. R1's OCR output always
requires spot-check before first citation.

### 5.7 Handbook-vs-code distinction (binding)

Registry `kind` drives mandatory labeling: R1-pattern entries
(`kind: code`, with `jurisdiction`) are introduced as legal/regulatory
material requiring the applicable-edition check; R2/R3-pattern entries
(`kind: handbook` / `educational`) are labeled
**"design handbook — not a substitute for the applicable mandatory
code."** Retrieval output repeats the label on every hit from a
handbook when the query concerns compliance, loads, safety, or
dimensions. This mirrors the skill's existing RED/professional-judgment
model (§10.8).

### 5.8 Anti-fabrication rules (binding, testable)

No invented page numbers, quotations, editions, clause IDs, or
"code requires X" statements. Uncertain sources are reported as
uncertain. Violation = P0 acceptance failure (§8.4 case M9).

---

## 6. Search and retrieval MVP

### 6.1 Index format

Per reference: `<lib>/.index/<id>/pages.jsonl` — one JSON object per
page: `{page, folio, class, method, text, figures[], flags[],
confidence}`. `text` is the extracted page text (or `""` with a
`figure` placeholder). Case M11-safe: indexes are caches, deletable and
rebuildable (§3.6).

### 6.2 Query pipeline (`ref_search`, proposed utility)

1. Normalize query (casefold; optional Arabic normalization ONLY if an
   Arabic corpus is confirmed — R1-dependent, default off).
2. Token-AND over page texts within one reference; rank by term
   frequency × rarity across that reference's pages (no cross-corpus IDF
   theatrics — keep it explainable).
3. Section-aware chunking: prefer PDF outline (bookmark) ranges when the
   file has them (R2/R3-era scans often don't — then fall back to
   heading-line heuristics + fixed page windows); every chunk retains
   `{page, section-or-null}`.
4. Retrieve the hit page ±1 page of context on request
   (`--context 1`); context pages are labeled as context, not hits.
5. Search global first or project first per §7.3; every hit labeled with
   its library of origin.

### 6.3 Scope and reporting

Default scope = both libraries; `--global-only` / `--project-only` /
`--ref <id>` narrow it. Empty library → `no-index` report naming the
empty scope (not an error). No reliable match → explicit
`no-reliable-match` with the terms searched and indexes consulted —
never a confabulated answer. Source-unavailable (missing file at search
time) → `source-unavailable` naming the expected path (§7.4).

### 6.4 Section awareness without over-engineering

P0 chunking = pages + outline ranges when present + heading heuristics.
No sentence-transformer segmentation, no layout-model sectioning.

### 6.5 Arabic-script readiness (conditional on R1 verification)

If R1 (or any OCR target) proves Arabic-script: Tesseract `ara` (+`eng`
for mixed pages), RTL-excerpt handling (store logical order, display
with direction markers, never reverse strings by hand), and a note that
keyword search across Arabic morphology is exact-form matching in P0
(no stemming). All gated on [DECISION D7] verification — not assumed.

### 6.6 Performance envelope (1,297-page reality)

R3-scale documents require: streaming JSONL (never whole-index in
memory for build), incremental rebuild (SHA-256 + extractor version —
§3.3), and a documented build-time expectation measured at
implementation (acceptance: full R3 rebuild completes unattended; exact
minutes recorded then, not guessed here).

### 6.7 Future extension path (not P0)

Semantic/RAG later needs only: chunk IDs stable across rebuilds
(`<ref-id>:<page>` — already the key), confidence/method fields to
weight embeddings, and a `figures[]` manifest to attach future
vision-model descriptions. P0 adds these fields; P0 builds no vectors.

---

## 7. Global / project-local resolution rules

### 7.1 Library locations (P0.1 as-built; D2 kept open for final sign-off)

- **Global:** `<home>/.config/autocad-skill/references/`, resolved through
  the same home-resolution convention as every other global path in the
  installer: `AUTOCAD_SKILL_HOME` override first, then `XDG_CONFIG_HOME`,
  then `<home>/.config`. This supersedes the earlier `%APPDATA%` sketch:
  `%APPDATA%` is Windows-only and would bypass the `AUTOCAD_SKILL_HOME`
  test override, breaking the hermetic-test guarantee that no test touches
  a real machine home. The adopted convention keeps behavior identical on
  every supported OS, keeps the library next to the existing global
  OpenCode configuration, and keeps potentially large future index caches
  out of roaming profiles. Contains `references.json` + `.index/`.
- **Project-local:** `<project>\.opencode\references\` (alongside the
  documented `.opencode/skills/` convention) with its own
  `references.json` + `.index/`. Unchanged from the proposal; implemented
  exactly as specified. Git-ignored by the user's own rules;
  the plan's installer guidance tells users to ignore it (§9.4).
- Reference PDFs may live inside or outside their library root; the
  manifest records either, with outside-root absolute paths flagged
  `portable: false` (R1–R3 stay at `D:\AI\skill\Ref` — outside both
  roots — which is explicitly supported: originals are never moved).

### 7.2 Discovery (deterministic)

On every run: read global manifest, then project manifest (project
manifest located by walking up from CWD to the OpenCode project root,
same rule OpenCode uses for project config). Each manifest entry is
resolved: file exists + readable → `available`; else `missing` /
`inaccessible` with reason. Files present on disk but absent from the
manifest are reported as `unregistered` (never auto-indexed — the user
registers explicitly, so nothing is silently absorbed).

Unregistered-file reporting is DEFERRED: not implemented in P0.1 and
not in P0.2 scope (see §11). Rationale: reporting it requires a
directory-listing policy (extensions, recursion, symlinked dirs) that
the approved plan does not specify, and P0.2 works strictly from
manifest-declared entries. Revisit only with an explicit decision that
defines the scan policy first.

### 7.3 Search precedence (binding)

Project-local hits rank before global hits; ties broken by explicit
`--ref` selection. Precedence affects ORDER ONLY — see §7.4 for
conflicts.

### 7.4 Conflict rules (binding — never silent)

- **Duplicate ID** (same `id` in both manifests, or twice in one):
  resolution STOPS for that ID with `duplicate-id` naming both entries;
  no source is picked. Fix: rename one ID (implementation prints the
  exact command).
- **Conflicting metadata** (same ID, different SHA-256 → different
  file/edition): `edition-conflict`; both candidates listed with
  version/byte evidence; user selects explicitly per query (`--ref`)
  or repairs the manifest. The system never "prefers newer".
- **Ambiguous version** (two files plausibly the same work, e.g.
  `Neufert.pdf` vs a future `neufert-4th-ed.pdf`): surfaced as
  `ambiguous-version` with a recommendation to assign distinct IDs.
- **Missing/inaccessible:** `source-unavailable` with expected path;
  indexing skips, search reports, exit code stays non-fatal for the
  unrelated remainder (§8.5).

---

## 8. Validation and test matrix

### 8.1 Who checks what (binding split)

- **`tests/validate_skill.py` (Level 1, static, no PDFs read):**
  manifest JSON-schema conformance (IDs kebab-case + unique,
  required fields, `kind` enum, no absolute machine paths in
  *committed fixtures*), index freshness fields present
  (SHA-256 + extractor name/version), forbidden patterns
  (fabricated-citation markers, e.g. hard-coded `page: <n>` claims in
  docs; `cloud-ocr` references; `.index/` paths committed).
  Fixtures are synthetic (see §8.4) — real reference files are never
  test inputs in-repo.
- **`doctor` (runtime, read-only):** library roots resolvable;
  manifests parse; each entry `available/missing/inaccessible`;
  index present/fresh/stale per entry; optional tools
  (`pypdf`: present/absent + version; `tesseract`: present/absent +
  version + languages) — all as **warnings**, never errors;
  empty-library notice. Exit codes follow existing `doctor`
  conventions (non-zero only on errors).
- **Indexing time (per run):** Tier-0 verdicts, per-page classes and
  errors, OCR-gate enforcement (OCR runs only with `ocr: true`),
  duplicate-SHA detection, partial-status aggregation.

### 8.2 Validator additions (P0, concrete)

Extend `validate_skill.py` with a `references` check module:
(1) if `references.json` fixtures exist under `tests/fixtures/`,
validate them against the registry schema; (2) assert no
`.index/` directory is committed; (3) assert the forbidden list
gains reference-specific entries, following the file's existing
practice of tracking obsolete internal-helper spellings:
`page \d+ of` hard claims in sample outputs, any `tesseract` install
instruction inside skill markdown, any MCP-tool-shaped spelling of the
search utility name inside `skill/` (search is a local utility, not an
MCP tool — naming discipline). All checks offline, hermetic, temp-dir
based like the installer suite. Like all `docs/` plans, this document
itself must stay Level-1 clean: no MCP-tool-shaped `name(...)`
spellings, no pipe-separated backticked token lists, no forbidden
literals.

### 8.3 `doctor` additions (P0, concrete)

`doctor` gains a `references` section: for each library —
`root ok/missing`, entry count, per-entry one-line status, index
freshness summary, optional-tool line
(`pdf-lib: pypdf 6.x present | absent (text extraction unavailable)`;
`tesseract: 5.x [eng+ara] present | absent (OCR unavailable)`).
Missing libraries and absent optional tools are **warnings**.

### 8.4 Acceptance test matrix (P0 — all must pass)

Fixtures: small synthetic PDFs generated at test time (reportlab-free —
hand-written minimal PDF bytes in the test itself, or checked-in
~1-page fixtures) PLUS the three real files as **local-only manual
fixtures** (paths documented, files never committed, suite skips
gracefully when absent).

| Case | Fixture / input | Expected |
|------|-----------------|----------|
| T1 text-based PDF | 2-page synthetic text PDF | `indexed`; per-page `text`; search finds terms with correct pages |
| T2 image-based PDF | synthetic image-only PDF (or R1 locally) | class `image` on all pages; `ocr:false` → no text, `ocr-required` notice; with OCR enabled + tesseract present → `ocr` text labeled as such |
| T3 mixed-content PDF | text + image pages (or R2/R3 locally) | per-page classes differ correctly; figures flagged |
| T4 failed/partial extraction | corrupt PDF; PDF with one bad page | `failed` with reason / `partial` with per-page `failed`; search labels partial-source hits |
| T5 missing reference file | manifest entry → deleted file | `source-unavailable` naming the path; rest of library still searchable |
| T6 inaccessible path | unreadable file (ACL) / bad drive | `inaccessible` with reason; non-fatal |
| T7 duplicate reference IDs | same ID twice | `duplicate-id` naming both; no silent pick |
| T8 conflicting editions/metadata | same ID, two SHA-256s | `edition-conflict` with evidence; explicit `--ref` resolves one query |
| T9 global vs project-local resolution | same ID in both libs | duplicate-ID stop (§7.4); distinct IDs → project hits rank first with origin labels |
| T10 missing page citations | hit on `unverified` page | output says `page: unverified`; downgraded lead wording (§5.4) |
| T11 OCR not installed | OCR-enabled entry, no tesseract | clear `ocr-unavailable` notice + manual-review guidance; exit non-fatal |
| T12 empty reference libraries | no manifests / zero entries | `no-index` notices; all commands exit 0 with guidance |
| T13 existing install without library | pre-P0 skill install | install/update/doctor unaffected; references section reports `not-configured` |
| T14 workflows without references | all 7 CAD workflows | byte-identical behavior; Level 1 suite still PASS; no new skill imports |

### 8.5 Failure-isolation rule (binding)

Reference-system failures (missing files, stale indexes, absent
optional tools, corrupt PDFs) **must not** alter skill behavior,
project memory (`projects/…`), checkpoints, or unrelated `doctor`
sections. Every reference command is independently non-fatal to the
rest of the system; T14 is the regression proof.

---

## 9. Privacy, licensing, and package distribution safeguards

### 9.1 Locality (binding)

R1–R3 remain at `D:\AI\skill\Ref`, unmoved, unrenamed, unmodified.
The system holds READS ONLY (plus OS-level read locks during hashing).
Installation, update, rollback, and re-indexing never move, delete, or
overwrite reference files. No reference file, excerpt corpus, or index
is uploaded anywhere, ever (cloud OCR rejected in §4.1-O3 for the same
reason).

### 9.2 Repository exclusion (binding)

Reference PDFs, `references.json` files containing local machine paths,
and `.index/` contents are NEVER committed. Mechanism (P0
implementation): `.gitignore` gains reference-specific entries —
proposed:
`references.json`, `**/.index/`, `**/ref-cache/`, `*.ref.json`
([DECISION D8] confirms names) — while the npm `files` allow-list
(`bin, lib, skill, README.md, CHANGELOG.md, LICENSE`) already excludes
anything reference-related by construction; implementation adds a
packaging assertion (fail `prepack` if a `.pdf` or `.index/` would
ship). Note: `tests/secret_audit.py` SKIPS `.pdf` by extension but
SCANS extracted-text formats — extracted page text and indexes must
therefore live outside the repo (or be synthetic fixtures), or a
verbatim code-like string from a handbook could trip the audit.
Test fixtures use synthetic text only.

### 9.3 Index/text/OCR-output storage policy

Generated artifacts live ONLY under `<lib>/.index/` (user's machine):
`inspect.json`, `pages.jsonl`, `doc.json`, OCR sidecars. Retention:
until the source SHA-256 or extractor version changes (then rebuilt);
deletion = safe rollback (§13.3). No index content is printed in full
by `doctor` (status lines only) to avoid pasting copyrighted text into
logs.

### 9.4 User-facing warnings (binding copy, P0)

- On first indexing of a `kind: code|standard`: "Reference works may
  be copyrighted. Indexes stay on this machine and are never uploaded
  or published."
- On any `partial` / `encoding-suspect` / `legacy-ocr-layer` source:
  "This source cannot be cited reliably beyond [scope] — verify
  against the original page before relying on it."
- On handbook hits for compliance queries: the §5.7 handbook label.

### 9.5 Distribution-rights default

Unless distribution rights explicitly allow inclusion, NO third-party
document content ships in the repo or package — including "small"
excerpts as fixtures. All committed test content is synthetic.

---

## 10. Integration with Engineering CAD workflows (future design only)

No file under `skill/` changes in P0. When a future phase wires
references into the agent loop, the flow is:

1. **Identify discipline/problem** (`requirement_rules.md` extraction —
   unchanged; the reference query is an additional lookup, not a new
   requirement class).
2. **Determine relevant references** (registry `kind`/jurisdiction
   filter; e.g. structural question → `kind: code` entries first,
   handbooks second with §5.7 labels).
3. **Search the local library** (both scopes per §7.3; failures per
   §7.4/§8.5 — a failed lookup degrades to "no reference evidence",
   never blocks the CAD workflow).
4. **Retrieve passages + citation records** (§5.2, method tags §5.5).
5. **Separate requirements from interpretation** (verbatim `excerpt`
   vs agent `interpretation` fields — mirrors the existing
   decisions/assumptions discipline).
6. **Present evidence and uncertainties** (confidence + review status +
   partial/legacy flags spoken aloud in the agent's message, per the
   skill's existing stop-and-explain style).
7. **Use evidence in design/CAD planning** (inform dimensions, layouts,
   plan-only drafts — subject to the same phase approvals as today).
8. **Never claim code compliance or dimensional verification** without
   adequate evidence: compliance statements stay in the existing RED /
   professional-judgment stop conditions (`risk_rules.md`,
   `stop_conditions.md` Category G); reference hits are evidence, not
   verdicts. The skill's honest verification limits
   (`docs/verification.md`) extend verbatim to reference-derived
   numbers.

---

## 11. Implementation phases and dependencies

- **P0.0 This plan + approvals (§12).** Acceptance: this document
  complete per the 13-section checklist (§13.4); decisions D1–D8
  answered. Depends on: nothing (done).
- **P0.1 Registry + discovery + doctor read-only section (IMPLEMENTED).**
  `references.json` schema, global/project-local discovery (§7.1 as-built),
  conflict surfacing (§7.4), and a read-only Reference library section in
  `doctor` output (no subcommand — the CLI parser ignores extra positionals,
  so a section is the backward-compatible integration). Acceptance T7, T8,
  T9, T12, T13 met: 22 new installer tests, suite 84/84 green, Level 1
  validation PASS. Unregistered-file reporting deferred (see §7.2).
  P0.1 review findings recorded in §13.1 — no blocking issue; symlink
  containment, Windows-only test assumptions, and `external` portability
  notes carry into P0.2 preparation.
- **P0.2 Ingestion + index (IMPLEMENTED 2026-10-11).** Tier-0 inspector
  (`tools/ref_inspect.py`, stdlib-only), Tier-1 extractor
  (`tools/ref_extract.py`, `pypdf==6.20.0` in opt-in `.venv-ref`),
  per-page records with figure/manual-review flags, incremental rebuild
  by SHA-256 + extractor version. Verified: 20/20 tool tests green
  (synthetic fixtures), local-only runs R1 445 image / R2 640 mixed-heavy
  / R3 1297 mixed-heavy with zero failed pages, full installer suite
  84/84 and Level 1 PASS unchanged. No OCR performed. Details:
  `docs/reference-p0.2-proposal.md`.
- **P0.3 Search MVP (IMPLEMENTED 2026-10-11 — detail:
  `docs/reference-p0.3-p0.4-plan.md` §1).** Search tool, method/confidence
  labels (§5.5), no-match reporting. Acceptance: T1, T3, T5, T6, T9,
  T10–T12. Depends on: P0.2.
- **P0.4 Validation hardening + docs (IMPLEMENTED 2026-10-11 — detail:
  `docs/reference-p0.3-p0.4-plan.md` §2).** `validate_skill.py`
  references module + forbidden patterns (§8.2), secret-audit-safe
  fixture policy (§9.2), `.gitignore`/prepack assertions (§9.2),
  user docs (library setup, registering R1–R3 locally, warnings
  §9.4). Acceptance: T13, T14, full matrix re-run, Level 1 PASS.
  Depends on: P0.1–P0.3, D8.

P1 candidates (explicitly not P0): re-OCR of R3's `no-tounicode`
pages; full R1 OCR + Arabic verification; table-structure work;
semantic search; SKILL.md/workflow integration (§10).

---

## 12. Open decisions requiring approval

- **[D1] PDF library: RESOLVED — `pypdf==6.20.0` approved and
  implemented** (BSD license verified from the shipped LICENSE file,
  pure-Python, `requires_python >=3.9`, working on Python 3.14).
  Pinned in `tools/requirements-ref.txt`, installed only in opt-in
  `.venv-ref`; the base skill works without it.
- **[D2] Library paths:** confirm the P0.1 as-built locations —
  `<home>/.config/autocad-skill/references` (with `AUTOCAD_SKILL_HOME`
  and `XDG_CONFIG_HOME` honored) and `<project>/.opencode/references`
  / propose alternatives. The earlier `%APPDATA%` sketch is withdrawn
  for the reasons recorded in §7.1; this decision now asks for final
  sign-off on the implemented convention, not a new design.
- **[D3] OCR engine:** approve optional Tesseract (version pin +
  language packs, at minimum `eng`; `ara` REQUIRED alongside `eng` now
  that Arabic script is observed in R1 — see §2) / reject OCR for P0
  (R1 then stays `ocr-required`, unindexed). No OCR in P0.2 either way.
- **[D4] Tooling shape: RESOLVED — `tools/ref_inspect.py` +
  `tools/ref_extract.py` + `tools/requirements-ref.txt` implemented**
  (repo `tools/`, Python, exact pin). The `ref_index` / `ref_search`
  names from the earlier sketch belong to P0.3 search work, not P0.2.
- **[D5] Manifest/Index formats: RESOLVED — `references.json` (§5.1) +
  `.index/<id>/{inspect.json,pages.jsonl,doc.json}` implemented** with
  two tightenings: `encoding-suspect` fires only for subset-tagged
  fonts lacking maps or partial coverage; incremental-skip returns the
  cached record without rewriting it.
- **[D6] Legacy layers: RESOLVED — shipped R2/R3 OCR layers accepted as
  `low`-confidence searchable text** (143 R3 pages flagged
  `encoding-suspect` by the subset heuristic); no re-OCR in P0.2.
- **[D7] R1 language/identity: PARTIALLY RESOLVED — Arabic script
  visually confirmed** in a sampled R1 figure (2026-10-11); OCR-phase
  planning must include the `ara` pack. Bibliographic fields stay
  `null/unverified`; full language survey waits for the OCR phase.
- **[D8] Ignore/packaging names: RESOLVED — `.venv-ref/` added to
  `.gitignore`** (npm `files` allow-list unchanged, nothing new can
  ship); prepack PDF/index assertions remain P0.4 work (§9.2).
- **[D9] Local-only real-file processing: RESOLVED — Tier-0/Tier-1 ran
  read-only on this machine** (R1 445 image / R2 640 / R3 1297, zero
  failed pages); nothing uploaded, nothing copied into the repo, run
  artifacts stayed in the OS temp dir and were removed.

---

## 13. Risks, limitations, and rollback strategy

### 13.1 Risks

1. Legacy OCR error (R2 2001 / R3 2002 layers; observed `Baumeisterand`
   joins; R3's 22/257 ToUnicode coverage) → wrong numbers cited.
   Mitigation: confidence defaults + spot-checks + §5.4 downgrades.
2. Table/drawing misreading → silent design error. Mitigation: figures
   are never text-cited (§3.4, §5.3).
3. Edition/jurisdiction confusion (duplicate/conflicting manifests;
   handbook cited as code). Mitigation: §7.4 stops + §5.7 labels.
4. Copyrighted-text leakage into logs/repo/package. Mitigation: §9
   (locality, allow-list packaging, audit-aware fixture policy).
5. Scope creep into RAG/semantic search. Mitigation: §1.2 non-goals +
   §6.7 parking lot.
6. Triangulated page counts (§2) prove estimates, not catalogs —
   implementation re-verifies with the approved parser; any
   discrepancy is recorded, not patched over.
7. P0.1 review findings (recorded 2026-10-11, independent review:
   APPROVE WITH FINDINGS — none blocking):
   symlink containment is lexical only, so a symlink inside a library
   root pointing outside passes the check; harmless in P0.1 (probes are
   existence-only, no content read) but P0.2 must add realpath
   containment before reading any registered file. One installer test
   assumes Windows drive letters and would fail rather than skip on
   other OSes; guard it no later than P0.2 test work. `external`
   absolute paths are allowed and flagged but their non-portable
   implications are not yet in user-facing docs; document before users
   register real collections. Per-entry doctor lines and
   unregistered-file reporting from §8.3/§7.2 remain deferred by
   design, not by omission.

### 13.2 Limitations (carried openly)

Stdlib-only inspection cannot render pages, measure OCR accuracy,
recover exact catalog page counts for object-stream files (R2), resolve
the 1297-vs-984 page signal for R3, identify R1's language, or judge
table fidelity. No OCR was performed; no claim in this plan depends on
OCR output. Everything unverified is labeled NOT VERIFIED or
`unverified` in-field.

### 13.3 Rollback strategy

Every P0 implementation step is reversible without user-data loss:
registries are plain JSON (restore from backup the tooling writes
before each mutation); `.index/` is a deletable cache (rebuild or
walk away); originals are never modified (§9.1); no skill/installer/
config behavior changes in P0, so T13/T14 hold throughout. Worst case:
delete manifests + `.index/` dirs → system is exactly today's system.

### 13.4 P0 completion checklist (all required for READY)

- [x] D1, D4–D9 resolved (§12, §14 of the P0.2 proposal); D2-final
  confirmed (homeDir/XDG convention); D3 scope note: no OCR in P0.2,
  `ara` pack requirement recorded for the OCR phase.
- [x] Registry + discovery + conflicts implemented (P0.1, T7–T9, T12–T13).
- [x] Ingestion with per-page status on all three real files, class
  histograms recorded (P0.2: R1 445 image / R2 638 mixed + 2 image /
  R3 1240 mixed + 57 image; zero failed pages).
- [x] Search MVP with method/confidence labels + no-match reporting
  (P0.3: 15 search tests, recorded real-index acceptance).
- [x] Validator + doctor + packaging safeguards (P0.4: validator [5],
  doctor index states, prepack fail behavior, user guide;
  Level 1 PASS).
- [ ] §9.4 warnings wired; §10 untouched (no `skill/` diff).
- [x] This document updated to record as-built deviations.
