import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).parents[1] / "scripts" / "sync-content.py"
spec = importlib.util.spec_from_file_location("sync_content", SCRIPT)
assert spec and spec.loader
sync_content = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_content)


class Response:
    def __init__(self, values):
        self.values = values

    def execute(self):
        return {"values": self.values}


class Values:
    def __init__(self, results):
        self.results = iter(results)

    def get(self, **_kwargs):
        return Response(next(self.results))


class Service:
    def __init__(self, results):
        self.values_api = Values(results)

    def spreadsheets(self):
        return self

    def values(self):
        return self.values_api


class SyncContentTest(unittest.TestCase):
    def test_second_source_failure_leaves_both_outputs_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = {name: "old-" + name for _, name in sync_content.JOBS}
            for name, text in old.items():
                (root / name).write_text(text)
            service = Service([
                [["judul", "tampil"], ["baru", "ya"]],
                [["gambar", "tampil"]],
            ])
            credentials = mock.Mock()
            modules = {
                "google.oauth2.credentials": mock.Mock(Credentials=credentials),
                "googleapiclient.discovery": mock.Mock(build=mock.Mock(return_value=service)),
            }
            with mock.patch.object(sync_content, "ROOT", root), mock.patch.dict("sys.modules", modules):
                with self.assertRaises(SystemExit):
                    sync_content.main()
            self.assertEqual({name: (root / name).read_text() for name in old}, old)
            self.assertEqual(list(root.glob("*.tmp")), [])

    def test_all_sources_valid_replace_both_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = Service([
                [["judul", "tampil"], ["galeri", "ya"]],
                [["gambar", "tampil"], ["review.webp", "ya"]],
            ])
            modules = {
                "google.oauth2.credentials": mock.Mock(Credentials=mock.Mock()),
                "googleapiclient.discovery": mock.Mock(build=mock.Mock(return_value=service)),
            }
            with mock.patch.object(sync_content, "ROOT", root), mock.patch.dict("sys.modules", modules):
                sync_content.main()
            for _, name in sync_content.JOBS:
                self.assertEqual(len(json.loads((root / name).read_text())["items"]), 1)


if __name__ == "__main__":
    unittest.main()
