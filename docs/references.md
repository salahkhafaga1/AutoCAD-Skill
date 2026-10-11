# Engineering Reference Library — User Guide

Status: **P0.1 + P0.2 implemented; P0.3 search implemented; P0.4
validation implemented.** OCR is not available in any current phase.

The reference library lets the CAD agent look up passages in your local
engineering documents (codes, handbooks) and cite them with page numbers.
Everything stays on your machine: originals are never moved, uploaded,
or published, and generated indexes are regenerable local caches.

## Fresh-machine setup (from npx, minutes)

On any new machine, with no repository checkout needed:

```text
npx autocad-skill install
npx autocad-skill refs init
npx autocad-skill doctor
```

`refs init` scaffolds the empty global library (directories plus an
empty manifest — existing files are never overwritten) and prints the
next steps. `doctor` then reports the toolchain state: reference
scripts found or missing, `pypdf` importable or not, Tesseract
installed or not. Each missing piece degrades gracefully (extraction
needs `pypdf`, OCR needs Tesseract, search needs only the indexes),
and every check is a warning at most — a fresh machine is a supported
state, never an error.

The optional extraction environment, only if you want Tier-1 indexing:

```text
python -m venv .venv-ref
.venv-ref/Scripts/python.exe -m pip install -r <package-tools>/requirements-ref.txt
```

(`tools/` ships inside the npm package next to `bin/` and `lib/`;
`requirements-ref.txt` pins the exact approved version.)

Tesseract is a machine-level install outside this project: run the
Windows installer with administrator rights and select the Arabic
language pack alongside English when offered. The skill never installs
it, and everything works without it except OCR itself.

## Library locations

- **Global (all your projects):** `<home>/.config/autocad-skill/references`
- **Project-local (one project):** `<project>/.opencode/references`

Each library holds a `references.json` manifest plus a `.index/` cache
directory created by the extraction tools. An absent or empty library is
a supported state — the skill and all CAD workflows work exactly the
same without one.

## Registering a document

Add an entry to the `references.json` of the library you want:

```json
{
  "references": [
    {
      "id": "ecp203-2025",
      "path": "ECP203-2025-compressed.pdf",
      "title": "ECP 203",
      "year": 2025,
      "jurisdiction": "EG",
      "kind": "code"
    }
  ]
}
```

Rules: `id` is lowercase kebab-case and unique across both libraries;
`path` is required. Relative paths must stay inside the library root
(`..` escapes are rejected). Absolute paths are allowed and flagged
`external` — this is how an existing collection that lives elsewhere
(such as a shared folder) is registered without moving any file — but
absolute paths are not portable to other machines, so prefer relative
paths for anything you might share or back up.

`kind` distinguishes mandatory engineering codes (`code`, with a
`jurisdiction`) from `standard`, `handbook`, `manufacturer`,
`educational`, and `other` material. A handbook is never a substitute
for the applicable mandatory code; retrieved handbook passages are
labeled as such whenever compliance, loads, safety, or dimensions are
at stake.

## Building the local index

Indexing is a deliberate local step (nothing is indexed automatically):

```text
python tools/ref_inspect.py --manifest <lib>/references.json --lib-root <lib> --out <lib>/.index-tmp
python tools/ref_extract.py --manifest <lib>/references.json --lib-root <lib> --out <lib>/.index
```

Tier-1 extraction needs the optional `pypdf` pin installed in the
opt-in `.venv-ref` (see `tools/requirements-ref.txt`); without it the
tools exit with a clear message and change nothing. Image-only scanned
pages are classified, never transcribed — there is no OCR in P0, so a
scanned code yields page classes and figure flags, not searchable text.
Re-running after changing files or extractor settings rebuilds only
what is stale (SHA-256 plus version tracking); deleting `.index/`
returns you to the unindexed state with zero data loss.

## Searching

```text
python tools/ref_search.py --lib global=<global-root> --lib project=<project-root> --query "door clearance"
```

Use `--ref <id>` to pin one document, `--json` for machine-readable
output, `--context 1` for neighboring pages. Every hit carries its
method tag, confidence, and flags — `legacy-ocr-layer` and
`encoding-suspect` mean what they say: verify against the original
page before relying on the numbers. A no-match answer names the terms
and the indexes consulted instead of inventing passages.

## Checking health

`npx autocad-skill doctor` reports each library (missing manifest,
invalid entries, duplicate or conflicting ids) and each index (fresh,
stale, not built, orphaned) as information or warnings — never errors.
A missing or empty library does not affect installation or CAD work.

## Warnings that matter

- Reference works may be copyrighted: indexes stay on this machine and
  are never uploaded or published. The npm package cannot contain PDFs,
  indexes, or manifests — the pack refuses them.
- Partial, legacy-OCR, or encoding-suspect sources cannot be cited
  beyond what their labels allow — confirm against the original page.
- Retrieved passages are evidence, not verdicts: code compliance and
  safety decisions stay with the responsible engineer, exactly as the
  skill's approval rules already require.
