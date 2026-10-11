# Release Readiness Plan — Git, Live AutoCAD, OCR, Release

Status: **PARTIALLY IMPLEMENTED 2026-10-11.** Track A complete
(committed + pushed). Track C: engine staged, gated tool implemented,
full transcription blocked (see Track C). Track D: versions bumped,
tools ship, smoke 49/49; npm publish blocked on registry auth (owner
step). Track B: environment surprise — AutoCAD 2021 binary present
and verified runnable (see Track B); interactive live test still
pending. Nothing below requiring a machine, credentials, or an
interactive session was performed.

Starting state (verified 2026-10-11): ~20 modified plus ~18 untracked
files covering the P0.1–P0.4 and P1 reference track; branch `main`
ahead of `origin/main` by 4 commits; remote `origin` points at
`github.com/salahkhafaga1/AutoCAD-Skill.git`. Skill 0.1.0, installer
0.2.0, tool contract v1. Level 4 live AutoCAD: PENDING (no AutoCAD on
this machine). OCR: not started. Secret audit: CLEAN.

---

## Track A — Preserve the work in git (do first)

**Goal:** every completed change committed on `main` and pushed, with a
clean tree afterwards.

1. Pre-commit safety pass: full installer suite green, both Python tool
   suites green, Level 1 validation PASS, secret audit CLEAN, Ref PDFs
   untouched. Any red stops the track.
2. Add the two missing ignore rules first (separate preparatory commit):
   `.index/` directories and `references.json` filenames, repo-wide.
   Rationale: P0.4 implemented only the `.venv-ref/` rule; without
   these, a future local index or manifest inside the repo would be
   committable. Verify with a dry `git status` after creating dummy
   paths in temp names, then remove the dummies (or verify by pattern
   inspection only — no dummies needed since no such paths exist today;
   the check is that `git check-ignore` matches the patterns).
3. Atomic commits, oldest work first, each re-verified before its commit:
   P0.1 installer registry; P0.2 tools plus venv ignore; P0.3 search;
   P0.4 hardening plus user guide; P1 skill integration; planning docs
   as their own commit. Small messages in the existing log style.
4. Push: confirm remote state first (fetch plus compare — the branch is
   already ahead, so expect fast-forward; if the remote moved, stop and
   reconcile, never force-push). Then push `main`.
5. Acceptance: `git status` clean, local `main` equals `origin/main`,
   GitHub shows the full history, and every suite still passes on the
   pushed tree.

## Track B — Live AutoCAD validation (Level 4)

**Status 2026-10-11: environment found, test not run.** Contrary to all
earlier audits, `C:\Program Files\Autodesk\AutoCAD 2021\acad.exe`
exists on this machine (installed after the P0.1 audit) and the core
console prints its banner and runs (R.47.0.0). COM is registered
(`AutoCAD.Application`, CurVer `AutoCAD.Application.24`). NO full GUI
launch was attempted: first-run/licensing UI in an unattended session
risks hanging the machine, so the interactive live test waits for a
user-present session.

Version caveat (blocking detail for the live run): this is AutoCAD
**2021** (type library acax24; only acax24*.tlb present), while
autocad-mcp was built and live-verified against **2026** (acax25). The
server picks the newest installed library and its COM calls are
unproven against the 2024 API. The live run must therefore ALSO answer
whether the 29-tool surface works against 2021, or the project needs
AutoCAD 2026 after all.

**Goal:** replace the honest PENDING with a documented PASS (or a
specific blockers list). This track needs a user-present session on
this machine — nothing here was performed beyond read-only recon.

**Goal:** replace the honest PENDING with a documented PASS (or a
specific blockers list). This track needs a Windows machine with
AutoCAD 2026, the autocad-mcp venv, and OpenCode — none present here,
so the first step is naming that machine.

1. Name the test machine and confirm prerequisites (AutoCAD opens a
   drawing, MCP server connects, skill loads in OpenCode).
2. Run the simple_room project end to end: create, continue, verify,
   modify, with checkpoints; then run one reference-backed requirement
   (a cited clearance from the local library) through UNDERSTAND to
   PLAN to show the P1 hook working live.
3. Record evidence per step (screenshots, measurements, timings,
   approvals given); any failure follows the skill's own BLOCKED
   rules — the test reports, never hot-fixes, mid-run.
4. Write results into `docs/verification.md` (Level 4 row) plus a
   CHANGELOG entry. A failed run records blockers instead of a PASS —
   honesty over greenness.
5. Acceptance: Level 4 row says PASS with dated evidence, or lists
   named blockers with owners. No code changes ship inside this track
   except test-note docs.

## Track C — OCR for the scanned code (R1)

**Status 2026-10-11: tooling implemented, engine staged, transcription
blocked.** Tesseract 5.4.0 installer staged in Downloads (hash verified
via winget metadata); install itself needs one elevated user step
(UAC denied the unattended install). `eng` plus `ara` best-model packs
staged under `%APPDATA%\autocad-skill\tessdata`. Gated tool
`tools/ref_ocr.py` plus `tests/test_ref_ocr.py` (5 tests) implemented.

Full-page R1 transcription is BLOCKED on rendering: R1's text lives in
JBIG2 bilevel streams (no local decoder) and its 445 JPEGs are 860×591
low-resolution figures — below reliable OCR quality and not full-page
rasters. Transcription waits on a page-render decision (e.g. a
rasterizer with acceptable licensing) OR user-supplied page renders.
The OCR tool verifies against any image the moment the engine exists;
nothing about it depends on the R1 decision.

**Goal:** transcribed, spot-checked R1 text with `low` confidence and
`ocr` method labels. No uploads, local engine only.

1. Install Tesseract (Windows UB Mannheim build) with `eng` plus `ara`
   packs on the processing machine; record exact version and pack
   versions. This is a machine setup step, not a repo dependency —
   nothing is added to any manifest or requirements file beyond a
   documented version note.
2. Implement the OCR pass: new opt-in flag on the Tier-1 extractor
   that shells to the local `tesseract` binary for `image`-class pages
   only when the manifest entry opts in, storing output with method
   `ocr`, engine plus pack versions, and `low` confidence. Default
   stays no-OCR; the flag is explicit per run.
3. Transcribe R1 locally (445 pages, unattended, timing recorded),
   then spot-check a sampled page set against rendered pages
   (Arabic-script tables first, per the D7 finding) and record the
   error classes observed.
4. Synthetic tests for the OCR branch (flag on/off, missing binary
   degrades cleanly, records carry method and version); reinstall-guard
   tests unchanged.
5. Acceptance: R1 `pages.jsonl` carries `ocr` method records with
   engine versions; spot-check report filed in the implementation
   notes; default runs still perform zero OCR; full suites green.
   Known limit carried openly: dense Arabic tables will need human
   review — transcription enables retrieval, not trust.

## Track D — Cut the release

**Status 2026-10-11: prepared through tagging; publish blocked on npm
auth (registry returns 401 — owner runs `npm login` then `npm
publish`).** Tools-shipping decision implemented: `tools/` ships via
the prepack copy step (bytecode filtered out), user guide stays
repo/GitHub-side consistent with existing docs handling. Versions:
skill 0.1.0 → 0.2.0, installer 0.2.0 → 0.3.0, contract stays 1.
Smoke 49/49 on the real 0.3.0 tarball (65 files, 98.9 kB, no banned
content).

**Goal:** versioned, published artifacts matching the implemented work.
Decisions first, mechanics second.

1. Decide the tools-shipping question (blocking): the npm `files`
   allow-list currently excludes `tools/`, so published users get the
   skill and installer but NOT the reference utilities the docs
   describe. Options: ship `tools/` via the prepack copy step
   (small, pure-Python, optional-dep safe — recommended), or keep
   repo-clone-only tooling and rewrite the user guide accordingly.
2. Versions per the repo semver policy (`docs/development.md`):
   skill MINOR bump for the backward-compatible reference capability,
   installer version bump for its new behavior; tool contract version
   moves only if a contract changed (it did not).
3. Mechanics: move `[Unreleased]` CHANGELOG entries under dated release
   headers, update `skill.json` and `package.json`, refresh every
   documented test count and status table in the same change, tag the
   release, publish to npm (credentials step — performed by the repo
   owner or under explicit instruction), and open the GitHub release
   notes from the CHANGELOG text.
4. Acceptance: clean tree, tags plus GitHub release plus npm package
   all show the same versions, installed-from-npm smoke verification
   passes, and `autocad-skill version` prints the new triple.

## 5. What approval covers (nothing below is approved)

- Track A commit/push plan including the two ignore-rule additions.
- Track B machine prerequisite plus honest PASS-or-blockers reporting.
- Track C Tesseract setup, OCR-pass implementation, and R1
  transcription with spot-checks.
- Track D tools-shipping decision, version bumps, and publish steps.
- Permission to commit and push (first network write in this
  repository's history under this workflow).
