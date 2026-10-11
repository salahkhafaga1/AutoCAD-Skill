#!/usr/bin/env python3
"""P0.3 search tests (stdlib unittest). No PDF parsing here: fixtures are
hand-authored manifests plus `pages.jsonl`/`doc.json` written directly,
proving search works on the artifact contract alone. Real-index runs are a
documented manual procedure, not part of this suite.

Run:  python tests/test_ref_search.py   (system Python is enough)
"""

from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))
import ref_search  # noqa: E402


def make_page(ref_id, page, text, method="direct-text", confidence="high",
              flags=None, section=None, folio=None):
    return {"ref_id": ref_id, "page": page, "folio": folio, "section": section,
            "class": "text", "method": method, "chars": len(text), "text": text,
            "figures": [], "flags": flags or [], "confidence": confidence,
            "review_status": "unreviewed"}


class SearchFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write_lib(self, scope, entries, indexes):
        """entries: manifest list; indexes: {ref_id: [page dicts]}."""
        lib = self.root / scope
        lib.mkdir(parents=True, exist_ok=True)
        (lib / "references.json").write_text(
            json.dumps({"references": entries}), encoding="utf-8")
        for ref_id, pages in indexes.items():
            idx = lib / ".index" / ref_id
            idx.mkdir(parents=True, exist_ok=True)
            (idx / "pages.jsonl").write_text(
                "\n".join(json.dumps(p, ensure_ascii=False) for p in pages) + "\n",
                encoding="utf-8")
            (idx / "doc.json").write_text(
                json.dumps({"ref_id": ref_id, "status": "indexed"}), encoding="utf-8")
        return lib

    def run_search(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        code = None
        with redirect_stdout(out), redirect_stderr(err):
            try:
                code = ref_search.main(list(argv))
            except SystemExit as exc:
                code = exc.code
        return code, out.getvalue(), err.getvalue()

    def lib_args(self, *scopes):
        args = []
        for scope in scopes:
            args += ["--lib", f"{scope}={self.root / scope}"]
        return args


class RankingTests(SearchFixture):
    def test_and_semantics_and_ranking(self):
        pages = [
            make_page("r", 1, "door clearance door clearance door"),
            make_page("r", 2, "door clearance"),
            make_page("r", 3, "door only, no second term"),
            make_page("r", 4, "unrelated matter"),
        ]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "door clearance")
        self.assertEqual(code, 0)
        lines = [line for line in out.splitlines() if line.startswith("[")]
        self.assertEqual(len(lines), 2)
        self.assertIn("p.1", lines[0])  # higher term frequency ranks first
        self.assertIn("p.2", lines[1])

    def test_method_confidence_passthrough(self):
        pages = [make_page("r", 5, "egress width requirement",
                           method="legacy-ocr-layer", confidence="low",
                           flags=["legacy-ocr-layer"])]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "egress width")
        self.assertEqual(code, 0)
        self.assertIn("[legacy-ocr-layer/low]", out)
        self.assertIn("flags: legacy-ocr-layer", out)

    def test_context_labeled_never_ranked(self):
        pages = [make_page("r", 1, "introductory remarks"),
                 make_page("r", 2, "the target term lives here"),
                 make_page("r", 3, "closing remarks")]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "target term",
                                "--context", "1")
        self.assertEqual(code, 0)
        self.assertIn("context p.1:", out)
        self.assertIn("context p.3:", out)
        self.assertEqual(len([l for l in out.splitlines() if l.startswith("[")]), 1)

    def test_real_section_preferred_over_heuristic(self):
        pages = [make_page("r", 1, "1.2 Doors\nDoor leaves shall be solid",
                           section="Doors")]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "door leaves")
        self.assertEqual(code, 0)
        self.assertIn("section (index): Doors", out)

    def test_heuristic_section_labeled(self):
        pages = [make_page("r", 1, "3.4 WINDOW TYPES\nAluminium frames")]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "aluminium frames")
        self.assertEqual(code, 0)
        self.assertIn("section (heuristic):", out)


class ScopeTests(SearchFixture):
    def test_project_ranks_before_global(self):
        self.write_lib("global", [{"id": "g", "path": "g.pdf"}],
                       {"g": [make_page("g", 1, "shared requirement text")]})
        self.write_lib("project", [{"id": "p", "path": "p.pdf"}],
                       {"p": [make_page("p", 1, "shared requirement text")]})
        code, out, _ = self.run_search(*self.lib_args("global", "project"),
                                "--query", "shared requirement")
        self.assertEqual(code, 0)
        lines = [l for l in out.splitlines() if l.startswith("[")]
        self.assertTrue(lines[0].startswith("[project/p]"))
        self.assertTrue(lines[1].startswith("[global/g]"))

    def test_scope_filters(self):
        self.write_lib("global", [{"id": "g", "path": "g.pdf"}],
                       {"g": [make_page("g", 1, "scoped term")]})
        self.write_lib("project", [{"id": "p", "path": "p.pdf"}],
                       {"p": [make_page("p", 1, "scoped term")]})
        _, out, _ = self.run_search(*self.lib_args("global", "project"),
                             "--query", "scoped term", "--project-only")
        self.assertNotIn("[global/g]", out)
        self.assertIn("[project/p]", out)

    def test_duplicate_ids_refused_without_ref(self):
        self.write_lib("global", [{"id": "dup", "path": "g.pdf"}],
                       {"dup": [make_page("dup", 1, "duplicated content")]})
        self.write_lib("project", [{"id": "dup", "path": "p.pdf"}],
                       {"dup": [make_page("dup", 1, "duplicated content")]})
        code, out, err = self.run_search(*self.lib_args("global", "project"),
                                  "--query", "duplicated content")
        self.assertEqual(code, 0)
        self.assertIn("duplicate id", err)
        self.assertNotIn("[global/dup]", out)
        self.assertNotIn("[project/dup]", out)

    def test_duplicate_ids_resolved_with_ref(self):
        self.write_lib("global", [{"id": "dup", "path": "g.pdf"}],
                       {"dup": [make_page("dup", 1, "duplicated content")]})
        self.write_lib("project", [{"id": "dup", "path": "p.pdf"}],
                       {"dup": [make_page("dup", 1, "duplicated content")]})
        code, out, _ = self.run_search(*self.lib_args("global", "project"),
                                "--query", "duplicated content", "--ref", "dup",
                                "--project-only")
        self.assertEqual(code, 0)
        self.assertIn("[project/dup]", out)


class OutputTests(SearchFixture):
    def test_json_envelope_schema(self):
        pages = [make_page("r", 7, "json output check words")]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "json output",
                                "--json")
        self.assertEqual(code, 0)
        envelope = json.loads(out)
        self.assertEqual(envelope["schema"], 1)
        self.assertEqual(envelope["query"], "json output")
        self.assertTrue(envelope["consulted"])
        hit = envelope["hits"][0]
        for key in ("ref_id", "scope", "page", "method", "confidence",
                    "excerpt", "score"):
            self.assertIn(key, hit)

    def test_no_match_names_terms_and_indexes(self):
        pages = [make_page("r", 1, "something entirely different")]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "absent zebra")
        self.assertEqual(code, 0)
        self.assertIn("no reliable match", out)
        self.assertIn("global/r", out)

    def test_missing_index_warns_exit_zero(self):
        self.write_lib("global", [{"id": "ghost", "path": "g.pdf"}], {})
        code, out, err = self.run_search(*self.lib_args("global"), "--query", "anything here")
        self.assertEqual(code, 0)
        self.assertIn("index-missing", err)

    def test_malformed_manifest_warns(self):
        lib = self.root / "global"
        lib.mkdir(parents=True, exist_ok=True)
        (lib / "references.json").write_text("{ broken", encoding="utf-8")
        code, out, err = self.run_search(*self.lib_args("global"), "--query", "x y")
        self.assertEqual(code, 0)
        self.assertIn("invalid manifest", err)

    def test_usage_errors_exit_two(self):
        lib = self.root / "global"
        lib.mkdir(parents=True, exist_ok=True)
        (lib / "references.json").write_text('{"references": []}', encoding="utf-8")
        base = self.lib_args("global")
        for argv in (["--query", "   "], ["--query", "x", "--limit", "0"],
                     ["--query", "x", "--ref", "nope"]):
            code, _, _ = self.run_search(*base, *argv)
            self.assertEqual(code, 2, argv)

    def test_limit_honored(self):
        pages = [make_page("r", i, f"repeated term page {i}") for i in range(1, 8)]
        self.write_lib("global", [{"id": "r", "path": "r.pdf"}], {"r": pages})
        code, out, _ = self.run_search(*self.lib_args("global"), "--query", "repeated term",
                                "--limit", "3")
        self.assertEqual(code, 0)
        self.assertEqual(len([l for l in out.splitlines() if l.startswith("[")]), 3)


if __name__ == "__main__":
    unittest.main(verbosity=1)
