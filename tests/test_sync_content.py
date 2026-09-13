import importlib.util
import json
import tempfile
import threading
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
            old = {name: "old-" + name for _, name, _ in sync_content.JOBS}
            for name, text in old.items():
                (root / name).write_text(text)
            service = Service([
                [["judul", "fotoRequest", "fotoJadi", "tampil"], ["baru", "a.webp", "b.webp", "ya"]],
                [],
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
                [["judul", "fotoRequest", "fotoJadi", "tampil"], ["galeri", "a.webp", "b.webp", "ya"]],
                [["gambar", "tampil"], ["review.webp", "ya"]],
            ])
            modules = {
                "google.oauth2.credentials": mock.Mock(Credentials=mock.Mock()),
                "googleapiclient.discovery": mock.Mock(build=mock.Mock(return_value=service)),
            }
            with mock.patch.object(sync_content, "ROOT", root), mock.patch.dict("sys.modules", modules):
                sync_content.main()
            for _, name, _ in sync_content.JOBS:
                self.assertEqual(len(json.loads((root / name).read_text())["items"]), 1)

    def test_all_hidden_is_valid_and_publishes_empty_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            service = Service([
                [["judul", "fotoRequest", "fotoJadi", "tampil"], ["galeri", "a.webp", "b.webp", "tidak"]],
                [["gambar", "tampil"], ["review.webp", "false"]],
            ])
            modules = {
                "google.oauth2.credentials": mock.Mock(Credentials=mock.Mock()),
                "googleapiclient.discovery": mock.Mock(build=mock.Mock(return_value=service)),
            }
            with mock.patch.object(sync_content, "ROOT", root), mock.patch.dict("sys.modules", modules):
                sync_content.main()
            for _, name, _ in sync_content.JOBS:
                self.assertEqual(json.loads((root / name).read_text()), {"items": []})

    def test_header_only_is_valid_and_publishes_empty_items(self):
        self.assertEqual(sync_content.items(
            [["judul", "fotoRequest", "fotoJadi", "tampil"]],
            {"judul", "fotoRequest", "fotoJadi", "tampil"},
        ), [])

    def test_malformed_header_is_rejected(self):
        with self.assertRaisesRegex(SystemExit, "missing: fotoJadi"):
            sync_content.items(
                [["judul", "fotoRequest", "tampil"], ["x", "a.webp", "ya"]],
                {"judul", "fotoRequest", "fotoJadi", "tampil"},
            )

    def test_second_publish_failure_rolls_back_both_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = {name: "old-" + name for _, name, _ in sync_content.JOBS}
            for name, text in old.items():
                (root / name).write_text(text)
            real_replace = sync_content.os.replace
            publishes = 0

            def fail_second_publish(source, target):
                nonlocal publishes
                if Path(target).name in old and ".new-" in Path(source).name:
                    publishes += 1
                    if publishes == 2:
                        raise OSError("injected second publish failure")
                return real_replace(source, target)

            pending = {name: json.dumps({"items": [{"new": name}]}) for name in old}
            with mock.patch.object(sync_content, "ROOT", root), mock.patch.object(sync_content.os, "replace", side_effect=fail_second_publish):
                with self.assertRaises(OSError):
                    sync_content.publish(pending)
            self.assertEqual({name: (root / name).read_text() for name in old}, old)
            self.assertEqual(list(root.glob(".*-sync-*")), [])

    def test_rollback_failure_preserves_backup_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            names = [name for _, name, _ in sync_content.JOBS]
            for name in names:
                (root / name).write_text("old-" + name)
            real_replace = sync_content.os.replace
            publishes = 0

            def fail_publish_and_rollback(source, target):
                nonlocal publishes
                source = Path(source)
                target = Path(target)
                if target.name in names and ".new-" in source.name:
                    publishes += 1
                    if publishes == 2:
                        raise OSError("injected publish failure")
                if ".old-" in source.name:
                    raise OSError("injected rollback failure")
                return real_replace(source, target)

            pending = {name: json.dumps({"items": [{"new": name}]}) for name in names}
            with mock.patch.object(sync_content, "ROOT", root), mock.patch.object(
                sync_content.os, "replace", side_effect=fail_publish_and_rollback
            ):
                with self.assertRaisesRegex(RuntimeError, "backups preserved"):
                    sync_content.publish(pending)
            workdirs = list(root.glob(".content-sync-*"))
            self.assertEqual(len(workdirs), 1)
            self.assertTrue((workdirs[0] / (names[0] + ".old-sync-content")).exists())

    def test_concurrent_publish_never_mixes_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            names = [name for _, name, _ in sync_content.JOBS]
            runs = [
                {name: json.dumps({"items": [{"run": marker}]}) for name in names}
                for marker in ("A", "B")
            ]
            barrier = threading.Barrier(2)

            def run(pending):
                barrier.wait()
                sync_content.publish(pending)

            with mock.patch.object(sync_content, "ROOT", root):
                threads = [threading.Thread(target=run, args=(pending,)) for pending in runs]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join()
            markers = {json.loads((root / name).read_text())["items"][0]["run"] for name in names}
            self.assertEqual(len(markers), 1)


if __name__ == "__main__":
    unittest.main()
