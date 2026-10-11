#!/usr/bin/env python3
"""P0.2 Tier-0/Tier-1 tests (stdlib unittest, no third-party test runner).

Run Tier-0 only with system Python:
    python tests/test_ref_tools.py
Run everything (needs the approved pypdf pin in .venv-ref):
    .venv-ref/Scripts/python.exe tests/test_ref_tools.py

Tier-1 tests skip cleanly when pypdf is absent. Fixtures are hand-built
minimal PDFs generated in-memory (no copyrighted content, no binaries).
The three real reference files are NEVER test inputs here; local-only
runs against them are a documented manual procedure (see
docs/reference-p0.2-proposal.md), not part of this suite.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))
import ref_inspect  # noqa: E402

try:
    import pypdf  # noqa: F401
    import ref_extract  # noqa: E402
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False


# --------------------------------------------------------------------------
# Hand-built minimal PDFs (valid xref, computed offsets).


def build_pdf(pages):
    """pages: list of {text: str|None, image: bool, badfilter: bool}."""
    objs: dict[int, bytes] = {}
    counter = [10]

    def add(body: bytes) -> int:
        objs[counter[0]] = body
        counter[0] += 1
        return counter[0] - 1

    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    img = None
    if any(p.get("image") for p in pages):
        raw = zlib.compress(b"\x00\x00\x00")
        img = add(b"<< /Type /XObject /Subtype /Image /Width 1 /Height 1 "
                  b"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Length " + str(len(raw)).encode()
                  + b" /Filter /FlateDecode >>\nstream\n" + raw + b"\nendstream")
    page_nums = []
    for spec in pages:
        parts = []
        if spec.get("image"):
            parts.append(b"q 10 0 0 10 0 0 cm /Im0 Do Q")
        if spec.get("text"):
            safe = spec["text"].replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            parts.append(b"BT /F1 12 Tf 50 700 Td (" + safe.encode("latin-1") + b") Tj ET")
        stream = b"\n".join(parts)
        if spec.get("badfilter"):
            # Deliberately broken: raw stream with a bogus filter name.
            content = add(b"<< /Length " + str(len(stream)).encode()
                          + b" /Filter /NoSuchFilter >>\nstream\n" + stream + b"\nendstream")
        else:
            # Real-world faithful: content streams are Flate-compressed.
            comp = zlib.compress(stream)
            content = add(b"<< /Length " + str(len(comp)).encode()
                          + b" /Filter /FlateDecode >>\nstream\n" + comp + b"\nendstream")
        res = b"<< /Font << /F1 " + str(font).encode() + b" 0 R >>"
        if img:
            res += b" /XObject << /Im0 " + str(img).encode() + b" 0 R >>"
        res += b" >>"
        page_nums.append(add(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents "
            + str(content).encode() + b" 0 R /Resources " + res + b" >>"))
    kids = b" ".join(str(k).encode() + b" 0 R" for k in page_nums)
    objs[2] = b"<< /Type /Pages /Kids [" + kids + b"] /Count " + str(len(page_nums)).encode() + b" >>"
    objs[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    out = [b"%PDF-1.4\n"]
    offsets = {}
    for num in sorted(objs):
        offsets[num] = sum(len(x) for x in out)
        out.append(str(num).encode() + b" 0 obj\n" + objs[num] + b"\nendobj\n")
    xref_pos = sum(len(x) for x in out)
    total = max(objs) + 1
    out.append(("xref\n0 %d\n" % total).encode())
    out.append(b"0000000000 65535 f \n")
    for i in range(1, total):
        out.append(("%010d 00000 n \n" % offsets.get(i, 0)).encode())
    out.append(("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
                % (total, xref_pos)).encode())
    return b"".join(out)


TEXT_PDF = build_pdf([{"text": "hello world page one " * 6}, {"text": "second page here " * 6}])
LONG_TEXT = " ".join(f"word{i}" for i in range(60))
MIXED_PDF = build_pdf([{"text": LONG_TEXT, "image": True}])
IMAGE_PDF = build_pdf([{"image": True}])
EMPTY_PDF = build_pdf([{}])
BAD_PDF = build_pdf([{"text": LONG_TEXT}, {"text": "bad", "badfilter": True}])
CORRUPT_BYTES = b"%PDF-1.4\n%truncated garbage without structure"


class Tier0Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, data: bytes) -> Path:
        p = self.root / name
        p.write_bytes(data)
        return p

    def test_text_pdf_inspectable_with_text_layer(self):
        rec = ref_inspect.inspect_file(self.write("t.pdf", TEXT_PDF), "t")
        self.assertEqual(rec["status"], "inspectable")
        # Two text streams is honestly "sparse" at book scale thresholds.
        self.assertEqual(rec["text_layer"], "present-sparse")
        self.assertGreaterEqual(rec["pages_estimate"], 1)
        self.assertEqual(len(rec["sha256"]), 64)

    def test_layer_verdict_thresholds(self):
        self.assertEqual(ref_inspect.layer_verdict(0), "absent")
        self.assertEqual(ref_inspect.layer_verdict(5), "present-sparse")
        self.assertEqual(ref_inspect.layer_verdict(500), "present-bulk")

    def test_image_pdf_layer_absent(self):
        rec = ref_inspect.inspect_file(self.write("i.pdf", IMAGE_PDF), "i")
        self.assertEqual(rec["status"], "inspectable")
        self.assertEqual(rec["text_layer"], "absent")
        self.assertGreater(rec["image_xobjects"], 0)

    def test_corrupt_bytes_flagged(self):
        rec = ref_inspect.inspect_file(self.write("c.pdf", CORRUPT_BYTES), "c")
        self.assertEqual(rec["status"], "corrupt")

    def test_missing_file_raises_oserror(self):
        with self.assertRaises(OSError):
            ref_inspect.inspect_file(self.root / "nope.pdf", "n")

    def test_bom_manifest_tolerated(self):
        self.write("a.pdf", TEXT_PDF)
        raw = self.root / "references.json"
        raw.write_bytes(b'\xef\xbb\xbf{"references": [{"id": "a", "path": "a.pdf"}]}')
        out = self.root / "out"
        self.assertEqual(ref_inspect.main(
            ["--manifest", str(raw), "--lib-root", str(self.root), "--out", str(out)]), 0)
        self.assertTrue((out / "a" / "inspect.json").exists())

    def test_manifest_mode_writes_per_ref(self):
        self.write("a.pdf", TEXT_PDF)
        self.write("b.pdf", IMAGE_PDF)
        manifest = self.root / "references.json"
        manifest.write_text(json.dumps({"references": [
            {"id": "a", "path": "a.pdf"}, {"id": "b", "path": "b.pdf"}]}), encoding="utf-8")
        out = self.root / "out"
        self.assertEqual(ref_inspect.main(
            ["--manifest", str(manifest), "--lib-root", str(self.root), "--out", str(out)]), 0)
        for ref_id in ("a", "b"):
            record = json.loads((out / ref_id / "inspect.json").read_text(encoding="utf-8"))
            self.assertEqual(record["ref_id"], ref_id)
            self.assertEqual(record["status"], "inspectable")


@unittest.skipUnless(HAS_PYPDF, "pypdf not installed (opt-in .venv-ref)")
class Tier1Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.lib = self.root / "lib"
        self.lib.mkdir()
        self.out = self.root / "out"

    def tearDown(self):
        self.tmp.cleanup()

    def write_lib(self, name, data: bytes) -> Path:
        p = self.lib / name
        p.write_bytes(data)
        return p

    def manifest(self, entries):
        m = self.root / "references.json"
        m.write_text(json.dumps({"references": entries}), encoding="utf-8")
        return m

    def run_extract(self, entries, ref_id=None, password=None):
        m = self.manifest(entries)
        argv = ["--manifest", str(m), "--lib-root", str(self.lib), "--out", str(self.out)]
        if ref_id:
            argv += ["--ref-id", ref_id]
        if password:
            argv += ["--password", password]
        self.assertEqual(ref_extract.main(argv), 0)
        return self.out

    def read_doc(self, ref_id):
        return json.loads((self.out / ref_id / "doc.json").read_text(encoding="utf-8"))

    def read_pages(self, ref_id):
        return [(json.loads(line)) for line in
                (self.out / ref_id / "pages.jsonl").read_text(encoding="utf-8").splitlines()]

    def test_text_pages_indexed_with_numbers(self):
        self.write_lib("t.pdf", TEXT_PDF)
        self.run_extract([{"id": "t", "path": "t.pdf"}])
        doc = self.read_doc("t")
        self.assertEqual(doc["status"], "indexed")
        self.assertEqual(doc["pages"], 2)
        self.assertEqual(doc["page_class_histogram"], {"text": 2})
        pages = self.read_pages("t")
        self.assertEqual([p["page"] for p in pages], [1, 2])
        self.assertIn("hello world page one", pages[0]["text"])
        self.assertEqual(pages[0]["method"], "direct-text")
        self.assertEqual(pages[0]["confidence"], "high")

    def test_mixed_page_flagged_with_figure(self):
        self.write_lib("m.pdf", MIXED_PDF)
        self.run_extract([{"id": "m", "path": "m.pdf"}])
        pages = self.read_pages("m")
        self.assertEqual(pages[0]["class"], "mixed")
        self.assertTrue(pages[0]["figures"])
        self.assertIn("word0", pages[0]["text"])

    def test_image_page_empty_unverified(self):
        self.write_lib("i.pdf", IMAGE_PDF)
        self.run_extract([{"id": "i", "path": "i.pdf"}])
        pages = self.read_pages("i")
        self.assertEqual(pages[0]["class"], "image")
        self.assertEqual(pages[0]["text"], "")
        self.assertEqual(pages[0]["confidence"], "unverified")

    def test_empty_page_class(self):
        self.write_lib("e.pdf", EMPTY_PDF)
        self.run_extract([{"id": "e", "path": "e.pdf"}])
        self.assertEqual(self.read_pages("e")[0]["class"], "empty")

    def test_bad_stream_page_partial(self):
        self.write_lib("b.pdf", BAD_PDF)
        self.run_extract([{"id": "b", "path": "b.pdf"}])
        doc = self.read_doc("b")
        self.assertEqual(doc["status"], "partial")
        self.assertGreaterEqual(doc["failed_pages"], 1)
        classes = [p["class"] for p in self.read_pages("b")]
        self.assertIn("failed", classes)
        self.assertIn("text", classes)

    def test_encrypted_skipped_without_password(self):
        from pypdf import PdfReader, PdfWriter
        src = self.write_lib("t.pdf", TEXT_PDF)
        enc = self.lib / "enc.pdf"
        reader = PdfReader(str(src))
        writer = PdfWriter()
        writer.add_page(reader.pages[0])
        writer.encrypt("testpw")
        with open(enc, "wb") as fh:
            writer.write(fh)
        self.run_extract([{"id": "enc", "path": "enc.pdf"}])
        doc = self.read_doc("enc")
        self.assertEqual(doc["status"], "skipped")
        self.assertEqual(doc["skip_reason"], "encrypted")

    def test_encrypted_with_test_password(self):
        from pypdf import PdfReader, PdfWriter
        src = self.write_lib("t.pdf", TEXT_PDF)
        enc = self.lib / "enc.pdf"
        reader = PdfReader(str(src))
        writer = PdfWriter()
        writer.add_page(reader.pages[0])
        writer.encrypt("testpw")
        with open(enc, "wb") as fh:
            writer.write(fh)
        self.run_extract([{"id": "enc", "path": "enc.pdf"}], password="testpw")
        doc = self.read_doc("enc")
        self.assertEqual(doc["status"], "indexed")

    def test_traversal_entry_unsafe(self):
        self.run_extract([{"id": "evil", "path": "../outside.pdf"}])
        doc = self.read_doc("evil")
        self.assertEqual(doc["status"], "skipped")
        self.assertIn("unsafe-path", doc["skip_reason"])

    def test_external_absolute_accepted_and_flagged(self):
        outside = Path(self.tmp.name) / "ext" / "abs.pdf"
        outside.parent.mkdir()
        outside.write_bytes(TEXT_PDF)
        self.run_extract([{"id": "ext", "path": str(outside)}])
        doc = self.read_doc("ext")
        self.assertEqual(doc["status"], "indexed")
        self.assertTrue(doc["external"])

    def test_symlink_escape_refused(self):
        outside = self.root / "outside.pdf"
        outside.write_bytes(TEXT_PDF)
        link = self.lib / "link.pdf"
        try:
            os.symlink(outside, link)
        except OSError as exc:
            self.skipTest(f"symlinks need privilege on this machine: {exc}")
        self.run_extract([{"id": "lnk", "path": "link.pdf"}])
        doc = self.read_doc("lnk")
        self.assertEqual(doc["status"], "skipped")
        self.assertIn("unsafe-path", doc["skip_reason"])

    def test_outline_sections_captured(self):
        from pypdf import PdfReader, PdfWriter
        src = self.write_lib("t.pdf", TEXT_PDF)
        outlined = self.lib / "o.pdf"
        writer = PdfWriter(clone_from=str(src))
        writer.add_outline_item("Doors", 1)
        with open(outlined, "wb") as fh:
            writer.write(fh)
        self.run_extract([{"id": "o", "path": "o.pdf"}])
        pages = self.read_pages("o")
        self.assertEqual(pages[1]["section"], "Doors")
        self.assertIsNone(pages[0]["section"])
        self.assertEqual(self.read_doc("o")["outline_sections"], 1)

    def test_incremental_second_run_up_to_date(self):
        self.write_lib("t.pdf", TEXT_PDF)
        entries = [{"id": "t", "path": "t.pdf"}]
        self.run_extract(entries)
        self.assertEqual(self.read_doc("t")["status"], "indexed")
        mtime = (self.out / "t" / "doc.json").stat().st_mtime
        import pypdf
        doc = ref_extract.extract_entry(pypdf, entries[0], self.lib, self.out)
        self.assertEqual(doc["status"], "up-to-date")
        self.assertEqual(doc["pages"], 2)  # returned record is the cached one
        self.assertEqual((self.out / "t" / "doc.json").stat().st_mtime, mtime)
        self.assertEqual(self.read_doc("t")["status"], "indexed")  # cache untouched

    def test_tounicode_helper_with_plain_dicts(self):
        total, mapped, suspect = ref_extract.font_tounicode_status(
            {"F1": {"/ToUnicode": object()}, "F2": {"/BaseFont": "X"}})
        self.assertEqual((total, mapped, suspect), (2, 1, False))
        subset, _, subset_suspect = ref_extract.font_tounicode_status(
            {"F1": {"/BaseFont": "ABCDEF+CustomFont", "/Subtype": "/Type0"}})
        self.assertTrue(subset_suspect)
        base14, _, base14_suspect = ref_extract.font_tounicode_status(
            {"F1": {"/BaseFont": "/Helvetica"}})
        self.assertFalse(base14_suspect)
        self.assertEqual(ref_extract.font_tounicode_status({}), (0, 0, False))
        self.assertEqual(ref_extract.font_tounicode_status(None), (0, 0, False))

    def test_legacy_ocr_helper(self):
        status, _ = ref_extract.detect_legacy_ocr(
            {"/Creator": "Acrobat 4.0 Scan Plug-in", "/Producer": "Adobe Acrobat 9.0 Paper Capture Plug-in"})
        self.assertEqual(status, "true")
        status, _ = ref_extract.detect_legacy_ocr({"/Creator": "OmniPage 11"})
        self.assertEqual(status, "true")
        status, _ = ref_extract.detect_legacy_ocr({"/Creator": "Word", "/Producer": "Word"})
        self.assertEqual(status, "false")
        self.assertEqual(ref_extract.detect_legacy_ocr({})[0], "unknown")
        self.assertEqual(ref_extract.detect_legacy_ocr(None)[0], "unknown")


if __name__ == "__main__":
    unittest.main(verbosity=1)
