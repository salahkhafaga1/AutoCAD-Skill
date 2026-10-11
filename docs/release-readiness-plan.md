# Release Readiness Plan — Git, Live AutoCAD, OCR, Release

Status: **PROPOSED, NOT APPROVED. Do not implement.** Four tracks, in
dependency order: A (preserve work) first, B and C in any order after A,
D last. Each track lists exact steps, evidence, and its own acceptance;
nothing is approved until §5 is signed off.

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
