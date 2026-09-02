import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("workflow.py")
SPEC = importlib.util.spec_from_file_location("functiongemma_workflow", MODULE_PATH)
assert SPEC and SPEC.loader
workflow = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = workflow
SPEC.loader.exec_module(workflow)


class WorkflowTest(unittest.TestCase):
    def test_valid_spec_resolves_paths_and_fixed_server_defaults(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec_path = root / "run.json"
            spec_path.write_text(json.dumps({
                "name": "candidate",
                "data": {"train": "train.jsonl", "development": "development.jsonl", "validation": "validation.json"},
                "train": {"base_model": "parent", "output": "output"},
            }), encoding="utf-8")
            spec, base = workflow.load_spec(spec_path)
            resolved = workflow.paths(spec, base)
            self.assertEqual(resolved["output"], root / "output")
            self.assertEqual(workflow.server_settings(spec, resolved)["port"], 8099)
            self.assertEqual(workflow.server_settings(spec, resolved)["container"], "subwave-functiongemma-eval")

    def test_report_verdict_requires_a_complete_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text(json.dumps({"overall": {"passed": 24, "total": 25}}), encoding="utf-8")
            self.assertEqual(workflow.report_verdict(path, "Q8").recommendation, "STOP")
            path.write_text(json.dumps({"overall": {"passed": 25, "total": 25}}), encoding="utf-8")
            self.assertEqual(workflow.report_verdict(path, "Q8").recommendation, "CONTINUE")

    def test_soak_verdict_reads_compact_report(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "soak.json"
            path.write_text(json.dumps({"passed": 129, "failed": 0, "decisions": 129}), encoding="utf-8")
            self.assertEqual(workflow.report_verdict(path, "soak").recommendation, "CONTINUE")


if __name__ == "__main__":
    unittest.main()
