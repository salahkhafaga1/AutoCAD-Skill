# P0.2 Proposal — Local PDF Inspection and Text Extraction

Status: **APPROVED AND IMPLEMENTED 2026-10-11** (decision authority
granted for all gates below). Implementation: `tools/ref_inspect.py`
(Tier-0, stdlib-only), `tools/ref_extract.py` (Tier-1, pypdf 6.20.0),
`tools/requirements-ref.txt` (exact pin), opt-in `.venv-ref`
(gitignored), `tests/test_ref_tools.py` (20 tests, synthetic fixtures).
No OCR was performed. No dependency is installed by default.

Parent plan: `docs/reference-system-plan.md` (§3, §4, §7–§9, §11 P0.2).
This proposal narrows P0.2 to an executable scope; where it conflicts
with the parent plan, the conflict is called out and the parent plan
governs until amended.

Conventions: **P0.2** = this proposal only. **P1** = explicitly later.
`MUST` / `MUST NOT` are acceptance gates.

---

## 1. Scope

### 1.1 In scope

- Tier-0 stdlib structural inspection (zero new dependencies).
- Tier-1 per-page text extraction with `pypdf`, **only if D1 is approved**.
- Per-page classes: `text`, `image`, `mixed`, `empty`, `failed`, `skipped`.
- Legacy-OCR-layer and `/ToUnicode`-coverage detection and reporting.
- SHA-256 + extractor name/version records for invalidation.
- Three generated artifacts with fixed schemas: `inspect.json`,
  `pages.jsonl`, `doc.json` under `<lib>/.index/<ref-id>/`.
- Corrupt / encrypted / unreadable / partially extractable handling.
- Realpath containment before reading any registered file.
- Synthetic fixtures for automated tests; local-only runs against the
  three real reference files with recorded (not asserted) outcomes.

### 1.2 Out of scope (non-goals)

- No OCR in P0.2 — the OCR gate stays off; R1 image pages are classified
  and reported, never transcribed. See §11.
- No search, no chunks, no embeddings, no index consumers.
- No table/equation/drawing reconstruction; figures are flagged, not parsed.
- No changes to `SKILL.md`, workflows, rules, schemas, CAD behavior,
  `autocad-mcp`, installer behavior, or package version.
- No dependency installed by default; the base skill and `doctor` work
  identically without the PDF tooling.

## 2. Placement and shape (approved as built)

- New directory `tools/` at the repository root (it does not exist yet):
  `tools/ref_inspect.py` for Tier-0, `tools/ref_extract.py` for Tier-1,
  `tools/requirements-ref.txt` holding the exact approved pin
  (`pypdf==6.20.0`, verified BSD license from the shipped LICENSE file).
- Both scripts are batch utilities driven by manifest + flags; they are
  not imported by the skill, the installer, or the validator.
- The Node `lib/references.js` registry stays the authority for
  discovery and `doctor`; the Python tools read `references.json`
  directly and write only under `.index/`.
- Environment: a dedicated virtual environment (proposed name
  `.venv-ref`, gitignored like every other venv in `.gitignore`),
  created only on machines that opt into Tier-1. Rationale: isolates an
  optional dependency from the autocad-mcp venv and from global Python;
  removal is deleting one directory.

## 3. Artifact schemas (approved as built)

All paths relative to the owning library root. All three artifacts are
regenerable caches; deleting `<lib>/.index/` loses no user data.

### 3.1 `inspect.json` (Tier-0 output, stdlib only)

```json
{
  "ref_id": "time-saver-2e",
  "source_path": "Time-saver Standards for Building Types.pdf",
  "sha256": "…",
  "bytes": 198148632,
  "pdf_header": "%PDF-1.4",
  "has_eof": true,
  "encrypted": false,
  "pages_estimate": 1297,
  "pages_estimate_method": "root-pagetree-count",
  "fonts_embedded": 257,
  "tounicode_maps": 22,
  "image_xobjects": 2593,
  "filter_census": { "FlateDecode": 2596, "DCTDecode": 2593 },
  "text_layer": "present-bulk",
  "inspector": { "name": "ref_inspect", "version": "0.1.0", "settings": {} },
  "inspected_at": "2026-…Z",
  "status": "inspectable",
  "errors": []
}
```

`text_layer` is one of `present-bulk`, `present-sparse`, `absent`,
`unknown`. `status` is one of `inspectable`, `encrypted`,
`corrupt`, `empty`, `unsupported`.

### 3.2 `doc.json` (Tier-1 registry record per reference)

Manifest metadata copied verbatim (`id`, `path`, `title`, `author`,
`edition`, `year`, `jurisdiction`, `kind`) plus: `sha256`, `bytes`,
`pages_estimated` + method, `extractor` name/version/settings,
`extracted_at`, overall `status` (`indexed`, `partial`, `failed`,
`skipped` with reason), `page_class_histogram`, `tounicode_coverage`
(`full`, `partial`, `none`, `unknown`), `legacy_ocr_layer`
(`true`, `false`, `unknown`) with evidence string, and an `errors` list.
Any extractor name/version/settings change invalidates stored pages.

### 3.3 `pages.jsonl` (one object per line, streamable)

```json
{ "ref_id": "time-saver-2e", "page": 1, "folio": null,
  "class": "mixed", "method": "direct-text",
  "chars": 1842, "text": "…page text or empty string…",
  "figures": [{ "kind": "image-region", "note": "manual review required" }],
  "flags": ["legacy-ocr-layer", "tounicode-partial"],
  "confidence": "low", "review_status": "unreviewed" }
```

`folio` holds the printed page number when detectable, else null; PDF
order in `page` is canonical. `text` is empty for `image` pages and for
figure-only regions. `confidence` and `review_status` follow the parent
plan §5.3 vocabulary; P0.2 never writes `human-verified` (no review UI
exists yet — that value is reserved).

## 4. Classification procedure

Tier-0 assigns a provisional class from structure alone (content-stream
operator census per page: text-showing operators vs image painting).
Tier-1 confirms with extraction results: a page is `text` only when
extracted character volume clears a minimum threshold AND image regions
are insignificant; `mixed` when both are significant; `image` when no
text extracts; `empty` when neither; `failed` with the exception class
on per-page errors; `skipped` with reason for encrypted/unparseable
pages. Thresholds are implementation-defined constants recorded in
`doc.json` extractor settings, so later tuning invalidates
deterministically. Borderline pages fall toward `mixed` (fail informative,
never fail silent).

## 5. Legacy OCR and ToUnicode detection

- `/ToUnicode` coverage per document from the font census; per-page
  attribution on a best-effort basis. Honest caveat carried from the
  audit: the exact per-page font API of the approved library version is
  confirmed at implementation time; if per-page attribution proves
  unreliable, the field stays document-level `partial`/`unknown` and
  affected pages carry `encoding-suspect`. Pages are never upgraded past
  `low` confidence on encoding grounds without the §5.6-style
  spot-check procedure.
- Legacy OCR layers are detected from producer/creator metadata plus
  text-layer vintage signals and recorded as evidence strings (as done
  for the 2001 Paper Capture and 2002 OmniPage layers in the audit).
  Detection is heuristic and labeled as such; it gates confidence, not
  availability.

## 6. Failure handling

`empty` (no text, no images): registered, indexed as empty, warning.
Corrupt (bad header, missing end-of-file marker, all pages failing):
`failed` with reason, no silent retries. Encrypted: `skipped/encrypted`
with a message asking for an unprotected copy — passwords are never
solicited, tried, or stored, with one narrow exception: the synthetic
test fixture uses a known password to prove the encrypted branch is
reachable and correctly skipped-or-reported per settings (see §9).
Unreadable (OS-level): `skipped/unreadable` with the OS error class.
Partial: per-page `failed` entries, document status `partial`, and every
downstream hit must carry the partial flag (consumer work is P0.3, but
the flag is written now or never).

## 7. Path safety (extends the P0.1 review finding)

Before reading any registered file, Tier-0 and Tier-1 MUST resolve the
manifest path against its library root, canonicalize with realpath
(resolving symlinks — closing the lexical-only gap recorded in the P0.1
review), and refuse anything escaping the root or an explicitly
registered external absolute path. Refusals are recorded as
`skipped/unsafe-path`, never retried, never bypassed by flag. The
check-then-read race is accepted and documented for local single-user
P0.2 use; concurrent-writer hardening is out of scope and stated as such.

## 8. Expected handling per real file (from the audit — predictions, not claims)

- **R1 ECP203 (image-only, ~445 pages, JBIG2 + JPEG):** Tier-0 reports
  `text_layer: absent`; Tier-1 yields ~445 `image` pages with empty
  text; document status `indexed` (successfully classified, nothing to
  transcribe); OCR stays off per §11, so no text is produced. Success is
  correct classification, NOT text output.
- **R2 Neufert (~640 pages, Paper Capture layer, zero ToUnicode maps):**
  bulk `text`/`mixed` pages with `legacy-ocr-layer` flags;
  `tounicode_coverage: none` at document level; confidence capped at
  `low` pending spot-checks.
- **R3 Time-Saver (~1297 estimated pages, OmniPage layer, 22/257
  ToUnicode):** bulk `text`/`mixed` pages; `tounicode_coverage:
  partial`; `encoding-suspect` on affected pages; confidence `low`
  pending spot-checks.

Implementation-time verification required (NOT pre-verified): exact
catalog page counts (audit counts were triangulated — R2 object-stream
pages, R3 1297-vs-984 signal), per-page class histograms, ToUnicode
attribution quality, threshold behavior on index-style multi-column
pages, and full-document runtimes. Synthetic fixtures prove mechanism;
only local-only runs prove these files.

## 9. Test plan (synthetic-first)

Fixtures are hand-written minimal byte-valid PDFs generated by the test
setup itself (no fixture ships copyrighted or opaque binary content):
text-only (2 pages, known strings + page numbers), image-only (painted
rectangles, zero text operators), mixed, empty (blank page), corrupt
(truncated stream, bad header variants), encrypted with a documented
test password (correct-password decrypts-and-reports, wrong-password
skips, never stored), partially extractable (one good page + one broken
stream), metadata-bearing (title/author/outline when the writer
supports it), and a symlink-escape case (guarded skip where symlinks
need privilege). Assertions cover: classes per page, page numbering and
folio fallback, failure statuses and reasons, manifest/schema errors,
containment refusals (relative escape, symlink escape, absolute-outside
without external registration), external-absolute acceptance with flag,
SHA-256/version invalidation (re-run after settings change re-extracts;
identical re-run skips), and artifact schema conformance for all three
files. Regression: full installer suite green, Level 1 validation PASS,
`skill/` diff empty. Local-only real-file procedure: run Tier-0 then
Tier-1 against each registered real file on the implementing machine,
record timings and histograms in the implementation report, assert only
ranges from §8 (never exact pre-baked counts), and publish no excerpts.

## 10. Confidence labeling in P0.2 outputs

Fresh direct-text on ToUnicode-clean pages: `high`. Legacy layers,
OCR-era artifacts, `encoding-suspect`, or `order-unverified` layouts:
`low` or `unverified` per the parent plan vocabulary. Image pages and
figures: not text-citable, cited as figure-with-page only by future
consumers. Missing page/section evidence: reported as unverified with
downgraded-lead wording — fabrication of page numbers, quotations,
editions, or clause IDs is an acceptance failure.

## 11. No-OCR confirmation

P0.2 performs no OCR: no engine installed, no transcription run, no
transcribed text stored. R1 image pages remain untranscribed by design;
their `ocr-required` state is reported, not resolved. Any future OCR
needs its own approval (parent plan D3) and is not smuggled in through
extraction dependencies.

## 12. Rollback and cleanup

Delete `<lib>/.index/` directories to return to the P0.1 state;
delete the opt-in virtual environment to remove the dependency
entirely; manifests, reference files, skill files, installer state,
and configuration are never touched by these tools, so nothing else
can need restoring. Test runs use throwaway directories exclusively.

## 13. Success definition (and explicit non-claims)

P0.2 succeeds when: Tier-0 classifies all synthetic fixtures and all
three real files without reading PDF content libraries beyond the
approved one; Tier-1 produces schema-conformant artifacts with correct
per-page classes, statuses, flags, and confidence labels; all failure
branches report instead of crashing; containment refuses all escape
fixtures; the full suite plus Level 1 stay green; and no OCR ran.
Success does NOT claim OCR accuracy (no OCR exists), table
reconstruction (figures are flagged, not parsed), reading-order
correctness on multi-column pages (marked `order-unverified` unless
checked), or engineering correctness of any extracted number (extracts
are evidence with confidence labels, never verdicts).

## 14. Approval checklist (resolved 2026-10-11 — all approved as stated)

- D1: **APPROVED `pypdf==6.20.0`** — BSD license verified from the shipped
  LICENSE file (redistribution clauses), pure-Python wheel,
  `requires_python >=3.9`, verified working on this machine's Python 3.14.
- D4: **APPROVED** — `tools/ref_inspect.py` + `tools/ref_extract.py` +
  `tools/requirements-ref.txt` as specified in §2.
- D5: **APPROVED** — artifact schemas in §3 implemented verbatim, with two
  tightening additions found during implementation: per-page
  `encoding-suspect` fires only for subset-tagged (`+`) fonts lacking maps
  or partial map coverage (Base-14 standard fonts without maps extract
  reliably and are not flagged); the incremental-skip path returns the
  cached record marked `up-to-date` without rewriting it.
- D6: **APPROVED** — shipped R2/R3 OCR layers accepted as `low`-confidence
  searchable text; no re-OCR in P0.2.
- D7: **RESOLVED (partial)** — a sampled R1 figure was visually confirmed
  to carry Arabic-script table labels, so OCR-phase planning MUST include
  the `ara` pack alongside `eng`. Full language survey and bibliographic
  identity stay unverified until the OCR phase.
- D8: **APPROVED** — `.venv-ref/` added to `.gitignore`; local venvs and
  `.index/` output never ship (npm `files` allow-list unchanged);
  `tests/secret_audit.py` skip list extended to `.venv-ref` (audit CLEAN).
- D9: **APPROVED** — local-only Tier-0/Tier-1 processing of the three
  PDFs ran read-only on this machine; nothing uploaded, nothing copied
  into the repo; run artifacts stayed in the OS temp dir and were removed.
- D2-final: **CONFIRMED** — homeDir/XDG convention stands.

## 15. As-built verification (local-only runs, OS temp output, removed after)

| File | Tier-0 | Tier-1 (pypdf 6.20.0) | Time |
|---|---|---|---|
| R1 ECP203 | pages~445, layer absent | 445 pages, 445 `image`, 0 failed, `indexed` | ~1 s |
| R2 Neufert | pages~0 (object streams, known), bulk | 640 pages exact, 638 `mixed` + 2 `image`, legacy true, ToUnicode-full 0, 0 failed | ~121 s |
| R3 Time-Saver | pages~1297, bulk | 1297 pages exact, 1240 `mixed` + 57 `image`, legacy true (OmniPage evidence), 143 `encoding-suspect`, 0 failed | ~83 s |

Exact catalog counts are now VERIFIED: 445 / 640 / 1297 (resolving the
audit's R2 object-stream gap and R3 1297-vs-984 signal in favor of 1297).
Test suite: 20/20 green on `.venv-ref` (1 skip: symlink needs privilege
on this machine), Tier-0 subset green on system Python with Tier-1
skipping cleanly without pypdf. Full installer suite 84/84 and Level 1
validation PASS unchanged (regression proof).

## 16. Dependency evaluation: pypdf (installed only in opt-in `.venv-ref`)

- **Verified metadata (PyPI record plus installed wheel, 2026-10-11):**
  6.20.0, pure-Python wheel, `requires_python >=3.9`, tested classifiers
  3.9–3.15 (including the 3.10+ floor this repo documents and the
  3.14 interpreter on this machine). The PyPI license field is empty, so
  the license was verified from the shipped LICENSE file instead
  (BSD redistribution clauses — see §14 D1).
- **Placement:** `tools/requirements-ref.txt` pins `pypdf==6.20.0`;
  installed only into the opt-in `.venv-ref` via
  `python -m venv .venv-ref` + `pip install -r tools/requirements-ref.txt`;
  removal is deleting that directory. Never in `package.json`, never
  imported by skill, installer, or validator.
- **Python/OS verification needed at implementation:** Windows +
  Python 3.14 exercises Tier-1 against all fixtures and the three real
  files; Tier-0 (stdlib) additionally smoke-run wherever the suite
  runs. Older Pythons within the repo floor are best-effort unless the
  pin declares otherwise.
- **Without the dependency:** everything P0.1 does keeps working;
  Tier-0 runs dependency-free; Tier-1 scripts exit with a clear
  `pdf-lib-unavailable` message and change nothing — the same
  warn-not-fail discipline `doctor` already uses for optional tools.
- **Licensing/maintenance/packaging:** permissive-license expectation
  (to be verified, not assumed); single-purpose small library with a
  stable extraction API; zero packaging impact (not shipped, not
  bundled, `.venv-ref` gitignored).
- **Alternatives:** no-new-dependency (stdlib census + sampling, as the
  audit proved — sufficient for classification, insufficient for
  faithful per-page text); PyMuPDF (stronger extraction/rendering, but
  binary wheels plus AGPL/commercial licensing — disproportionate for
  P0.2); pdfplumber/pdfminer (heavier, table-oriented — revisit only if
  P1 table work is approved).
- **Risks (carried openly):** legacy encodings and missing ToUnicode
  maps can yield wrong glyphs (flagged, never silently trusted);
  scanned pages correctly yield empty text (R1 success looks like
  "nothing found" and must be read as classification, not failure);
  tables, equations, diagrams, and multi-column order do not survive
  plain-text extraction (layout mode approximates visual order only);
  JBIG2/CCITT image regions are never decoded into meaning by this
  layer.
