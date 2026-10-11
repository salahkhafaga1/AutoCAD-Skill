#!/usr/bin/env python3
"""Track C OCR-tool tests (stdlib unittest). No engine, no images needed:
engine interaction is stubbed; arg/file handling uses temp paths.

Run:  python tests/test_ref_ocr.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))
import ref_ocr  # noqa: E402


class OcrToolTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def fake_image(self, name="page.jpg"):
        p = self.root / name
        p.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 64)
        return p

    def test_missing_image_exits_1(self):
        self.assertEqual(ref_ocr.main(["--image", str(self.root / "nope.jpg")]), 1)

    def test_missing_binary_degrades_cleanly(self):
        image = self.fake_image()
        real_is_file = Path.is_file

        def selective_is_file(path):
            if str(path) == str(image):
                return True
            return False

        with mock.patch.object(Path, "is_file", autospec=True,
                               side_effect=lambda self: selective_is_file(self)):
            with mock.patch("shutil.which", return_value=None):
                code = ref_ocr.main(["--image", str(image)])
        self.assertEqual(code, 3)

    def test_record_shape_with_stubbed_engine(self):
        image = self.fake_image()
        fake_version = mock.Mock(returncode=0, stdout="tesseract 5.4.0\nleptonica\n", stderr="")
        fake_run = mock.Mock(returncode=0, stdout="hello world\n", stderr="")
        with mock.patch("ref_ocr.find_binary", return_value=Path("tesseract")), \
             mock.patch("subprocess.run", side_effect=[fake_version, fake_run]):
            out = self.root / "out"
            code = ref_ocr.main(["--image", str(image), "--lang", "eng",
                                 "--out", str(out)])
        self.assertEqual(code, 0)
        sidecar = out / "page.ocr.json"
        record = json.loads(sidecar.read_text(encoding="utf-8"))
        self.assertEqual(record["method"], "ocr")
        self.assertIn("5.4.0", record["engine"])
        self.assertEqual(record["langs"], "eng")
        self.assertEqual(record["text"], "hello world\n")
        self.assertEqual(record["chars"], len("hello world\n"))

    def test_engine_error_propagates_nonzero(self):
        image = self.fake_image()
        fake_version = mock.Mock(returncode=0, stdout="tesseract 5.4.0", stderr="")
        fake_run = mock.Mock(returncode=1, stdout="", stderr="error")
        with mock.patch("ref_ocr.find_binary", return_value=Path("tesseract")), \
             mock.patch("subprocess.run", side_effect=[fake_version, fake_run]):
            code = ref_ocr.main(["--image", str(image)])
        self.assertEqual(code, 1)

    def test_bad_psm_rejected(self):
        image = self.fake_image()
        with self.assertRaises(SystemExit) as ctx:
            ref_ocr.main(["--image", str(image), "--psm", "99"])
        self.assertEqual(ctx.exception.code, 2)


if __name__ == "__main__":
    unittest.main(verbosity=1)
