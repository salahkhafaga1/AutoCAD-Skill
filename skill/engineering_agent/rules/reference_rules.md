# Reference Lookup Rules

The agent may consult the local engineering reference library during
UNDERSTAND and PLAN. Retrieved passages are evidence with confidence
labels — never verdicts, never approvals, never geometric proof.

---

## Step 1 — Decide Whether to Search

Search when the request involves any of:

- A named code, standard, clearance, or minimum dimension the user did
  not fully specify ("per code", "standard door", "accessible clearance")
- A material, system, or sizing choice the user left open
- A claim of the form "standard X says Y" that needs a source

Do NOT search for pure geometry the user fully specified, and never
search instead of asking about project-specific unknowns (site
dimensions, placements, user preferences). If no library is configured,
skip this entire file and proceed exactly as before.

---

## Step 2 — Run the Search

Run the repository search command from the runtime environment with
explicit library roots, for example:

```text
python tools/ref_search.py --lib global=<global-root> --lib project=<project-root> --query "door clearance" --json
```

Pin `--ref` to one reference id when the discipline is known. Prefer
`--json` output for machine-readable hits. The command reads page
indexes only; it never opens PDF files and never transcribes scanned
pages. No OCR engine is installed or invoked anywhere in this workflow.

---

## Step 3 — Handle Failure by Degrading, Never by Inventing

If the library is absent, an index is missing, a source is
unavailable, or the answer is an explicit no-match: record the short
phrase "no reference evidence" and continue the existing workflow
unchanged. Reference failures MUST NOT block planning, corrupt project
state, or produce passages. A missing passage is information, not an
error to work around with a guessed value.

---

## Step 4 — Separate Excerpt from Interpretation

Every used passage keeps two strictly separated parts:

- **Excerpt (verbatim):** the retrieved text plus its reference id,
  page, method tag, confidence, and flags. Copy it exactly.
- **Interpretation (agent's own words):** what the agent concludes for
  this project, in a separate field or paragraph — never interleaved
  with the excerpt.

Repeat the method tag, confidence, and any flags every time a passage
is reused. Passages marked `low`, `unverified`, or carrying
`legacy-ocr-layer`, `encoding-suspect`, or partial-source flags are
presented with their limits spoken aloud. Missing page or section
evidence is reported as unverified with downgraded-lead wording.

---

## Step 5 — Respect the Prohibitions

- **No compliance verdicts.** Phrases like "complies with X" stay
  RED professional-judgment stops. A retrieved passage supports the
  engineer's decision; it never replaces it.
- **No dimensional verification from text.** Passages inform
  *requirements* (which value to use), never *measurements* (whether
  the drawing matches). Geometry evidence rules are unchanged.
- **No handbook as mandatory code.** When a compliance, load, safety,
  or dimension question is answered from a handbook, manufacturer, or
  educational source, label it as such every time: a handbook is not a
  substitute for the applicable mandatory code.
- **No silent upgrades.** Never raise a `low` passage to `high`
  without a spot-check against the original page. Never fill in a
  missing page number.

---

## Step 6 — Record Citations in Project Memory

Cited requirements store a citation object: reference id, page
(integer or null), method, confidence. See the `citation` fields in
the decision, assumption, and constraint schemas — all optional, all
backward-compatible. Uncited defaults stay assumptions with
confidence, exactly as before. A record claiming a source it cannot
show is a fabrication: omit the citation instead.
