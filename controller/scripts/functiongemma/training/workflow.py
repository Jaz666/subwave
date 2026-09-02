#!/usr/bin/env python3
"""Resumable, terminal-first FunctionGemma training and Q8 acceptance workflow.

One run specification owns paths, hyperparameters and the fixed llama.cpp test
endpoint.  Every expensive stage writes state, prints a short summary, and
pauses for an operator decision unless --yes is supplied.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


STAGES = ("prepare", "train", "native", "convert", "serve", "q8", "soak")
DEFAULT_SERVER_IMAGE = "ghcr.io/ggml-org/llama.cpp:server"
DEFAULT_CONTAINER = "subwave-functiongemma-eval"
DEFAULT_PORT = 8099


@dataclass(frozen=True)
class Verdict:
    recommendation: str
    reason: str


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def absolute(base: Path, raw: str) -> Path:
    path = Path(raw).expanduser()
    return path if path.is_absolute() else (base / path).resolve()


def project_root(base: Path) -> Path:
    for candidate in (base, *base.parents):
        if (candidate / "controller" / "package.json").is_file():
            return candidate
    raise ValueError(f"{base}: cannot locate project root containing controller/package.json")


def command(value: list[str] | str, *, base: Path) -> list[str]:
    if isinstance(value, list) and all(isinstance(part, str) for part in value):
        return value
    if isinstance(value, str):
        return ["bash", "-lc", value]
    raise ValueError(f"{base}: commands must be strings or arrays of strings")


def required(spec: dict[str, Any], name: str) -> str:
    value = spec.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"run spec requires non-empty {name!r}")
    return value


def load_spec(path: Path) -> tuple[dict[str, Any], Path]:
    spec = read_json(path)
    required(spec, "name")
    for section in ("data", "train"):
        if not isinstance(spec.get(section), dict):
            raise ValueError(f"run spec requires {section!r} object")
    base = path.parent.resolve()
    data = spec["data"]
    for field in ("train", "development", "validation"):
        required(data, field)
    train = spec["train"]
    for field in ("base_model", "output"):
        required(train, field)
    return spec, base


def paths(spec: dict[str, Any], base: Path) -> dict[str, Path]:
    data = spec["data"]
    output = absolute(base, spec["train"]["output"])
    return {
        "train": absolute(base, data["train"]),
        "development": absolute(base, data["development"]),
        "validation": absolute(base, data["validation"]),
        "output": output,
        "best": output / "best",
        "state": output / "workflow-state.json",
        "native_predictions": output / "native-predictions.jsonl",
        "native_report": output / "native-report.json",
        "gguf_source": output / "gguf-source",
        "gguf": output / spec.get("gguf", {}).get(
            "filename", f"Subwave-FunctionGemma-{spec['name']}-Q8_0.gguf"
        ),
        "q8_report": output / "q8-report.json",
        "soak_report": output / "q8-soak.json",
    }


def jsonl_count(path: Path) -> int:
    with path.open(encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def write_state(path: Path, stage: str, *, status: str, detail: dict[str, Any]) -> None:
    prior: dict[str, Any] = {}
    if path.exists():
        prior = read_json(path)
    stages = prior.setdefault("stages", {})
    stages[stage] = {"status": status, "at": now(), **detail}
    prior["name"] = prior.get("name") or path.parent.name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(prior, indent=2) + "\n", encoding="utf-8")


def next_unfinished_stage(state_path: Path) -> str | None:
    if not state_path.is_file():
        return "prepare"
    recorded = read_json(state_path).get("stages", {})
    if not isinstance(recorded, dict):
        return "prepare"
    for stage in STAGES:
        detail = recorded.get(stage, {})
        status = detail.get("status") if isinstance(detail, dict) else None
        # REVIEW means the stage completed safely and awaits the operator;
        # STOP means it is the stage to retry after a correction.
        if status not in {"continue", "review"}:
            return stage
    return None


def run(argv: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    print("command: " + " ".join(argv), flush=True)
    result = subprocess.run(argv, cwd=cwd, text=True, capture_output=True, check=False)
    log_name = os.environ.get("FUNCTIONGEMMA_WORKFLOW_LOG")
    if log_name:
        log = Path(log_name)
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("a", encoding="utf-8") as handle:
            handle.write("command: " + " ".join(argv) + "\n")
            handle.write(result.stdout)
            handle.write(result.stderr)
    if result.returncode:
        detail = (result.stderr or result.stdout).strip().splitlines()[-1:]
        if detail:
            print("command failed: " + detail[0], file=sys.stderr)
        if log_name:
            print("full command log: " + log_name, file=sys.stderr)
    return result


def summary(stage: str, verdict: Verdict, extra: str = "") -> None:
    print(f"\n[{stage}] {verdict.recommendation} — {verdict.reason}")
    if extra:
        print(extra)


def pause(stage: str, verdict: Verdict, *, assume_yes: bool) -> bool:
    if verdict.recommendation == "STOP":
        return False
    if assume_yes:
        return True
    answer = input(f"Continue after {stage}? [y/N] ").strip().lower()
    return answer in {"y", "yes"}


def report_verdict(path: Path, label: str) -> Verdict:
    if not path.exists():
        return Verdict("STOP", f"{label} report was not written")
    report = read_json(path)
    overall = report.get("overall", {})
    passed, total = overall.get("passed"), overall.get("total")
    if isinstance(passed, int) and isinstance(total, int):
        if passed == total:
            return Verdict("CONTINUE", f"{label} passed {passed}/{total}")
        return Verdict("STOP", f"{label} failed: {passed}/{total} passed")
    if isinstance(report.get("passed"), int) and isinstance(report.get("failed"), int):
        total = report.get("decisions", report["passed"] + report["failed"])
        if report["failed"] == 0:
            return Verdict("CONTINUE", f"{label} passed {report['passed']}/{total}")
        return Verdict("STOP", f"{label} failed: {report['passed']}/{total} passed")
    return Verdict("STOP", f"{label} report has no usable pass/fail summary")


def stage_prepare(spec: dict[str, Any], base: Path, p: dict[str, Path]) -> Verdict:
    for item in spec.get("data", {}).get("prepare", []):
        result = run(command(item, base=base), cwd=project_root(base))
        if result.returncode:
            return Verdict("STOP", "data preparation command failed")
    missing = [name for name in ("train", "development", "validation") if not p[name].is_file()]
    if missing:
        return Verdict("STOP", "missing " + ", ".join(missing) + " input")
    try:
        train, development = jsonl_count(p["train"]), jsonl_count(p["development"])
        validation = len(json.loads(p["validation"].read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as error:
        return Verdict("STOP", f"invalid dataset input: {error}")
    if train == 0 or development == 0 or validation == 0:
        return Verdict("STOP", "one or more dataset splits are empty")
    return Verdict("CONTINUE", f"inputs ready: {train} train, {development} development, {validation} validation")


def stage_train(spec: dict[str, Any], base: Path, p: dict[str, Path]) -> Verdict:
    cfg = spec["train"]
    python = spec.get("python", sys.executable)
    argv = [python, "controller/scripts/functiongemma/training/train.py", "--train", str(p["train"]),
            "--development", str(p["development"]), "--output", str(p["output"]),
            "--model", cfg["base_model"], "--epochs", str(cfg.get("epochs", 1)),
            "--batch-size", str(cfg.get("batch_size", 4)), "--gradient-accumulation", str(cfg.get("gradient_accumulation", 2)),
            "--max-length", str(cfg.get("max_length", 1024)), "--learning-rate", str(cfg.get("learning_rate", 5e-6)),
            "--early-stopping-patience", str(cfg.get("early_stopping_patience", 1)), "--seed", str(cfg.get("seed", 20260902))]
    if cfg.get("resume"):
        argv.extend(["--resume", str(cfg["resume"])])
    result = run(argv, cwd=project_root(base))
    if result.returncode or not p["best"].is_dir():
        return Verdict("STOP", "training failed or did not create best checkpoint")
    summary_path = p["output"] / "run-summary.json"
    if summary_path.is_file():
        run_summary = read_json(summary_path)
        metric = run_summary.get("best_metric")
        return Verdict("REVIEW", f"training completed; best eval loss={metric}. Compare this to the parent before continuing.")
    return Verdict("REVIEW", "training completed; inspect the run summary before continuing")


def stage_native(spec: dict[str, Any], base: Path, p: dict[str, Path]) -> Verdict:
    native = spec.get("native", {})
    python = spec.get("python", sys.executable)
    result = run([python, "controller/scripts/functiongemma/training/evaluate.py", "--model", str(p["best"]),
                  "--scenarios", str(p["validation"]), "--output", str(p["native_predictions"]),
                  "--iterations", str(native.get("iterations", 5))], cwd=project_root(base))
    if result.returncode:
        return Verdict("STOP", "native evaluation failed")
    result = run(["npx", "tsx", "controller/scripts/functiongemma/cli.ts", "--predictions", str(p["native_predictions"]), "--scenarios-file", str(p["validation"]),
                  "--out", str(p["native_report"])], cwd=project_root(base))
    return report_verdict(p["native_report"], "native gate") if result.returncode == 0 else Verdict("STOP", "native scorer failed")


def stage_convert(spec: dict[str, Any], base: Path, p: dict[str, Path]) -> Verdict:
    python = spec.get("python", sys.executable)
    if p["gguf_source"].exists() or p["gguf"].exists():
        return Verdict("STOP", "conversion output already exists; use a new run output directory")
    prepare = run([python, "controller/scripts/functiongemma/training/prepare_gguf.py", "--source", str(p["best"]), "--output", str(p["gguf_source"])], cwd=project_root(base))
    if prepare.returncode:
        return Verdict("STOP", "GGUF source preparation failed")
    convert = run(["docker", "run", "--rm", "-v", f"{p['gguf_source']}:/input:ro", "-v", f"{p['output']}:/output",
                   "ghcr.io/ggml-org/llama.cpp:full", "--convert", "/input", "--outfile", f"/output/{p['gguf'].name}", "--outtype", "q8_0"], cwd=project_root(base))
    return Verdict("CONTINUE", f"Q8 model ready: {p['gguf'].name}") if convert.returncode == 0 and p["gguf"].is_file() else Verdict("STOP", "Q8 conversion failed")


def server_settings(spec: dict[str, Any], p: dict[str, Path]) -> dict[str, Any]:
    cfg = spec.get("server", {})
    return {"container": cfg.get("container", DEFAULT_CONTAINER), "port": int(cfg.get("port", DEFAULT_PORT)),
            "image": cfg.get("image", DEFAULT_SERVER_IMAGE), "context": int(cfg.get("context", 4096)),
            "model_name": f"/models/{p['gguf'].name}"}


def stage_serve(spec: dict[str, Any], base: Path, p: dict[str, Path]) -> Verdict:
    if not p["gguf"].is_file():
        return Verdict("STOP", "Q8 model is absent")
    cfg = server_settings(spec, p)
    existing = subprocess.run(["docker", "ps", "-aq", "-f", f"name=^{cfg['container']}$"], text=True, capture_output=True, check=False).stdout.strip()
    if existing:
        stop = run(["docker", "rm", "-f", cfg["container"]], cwd=project_root(base))
        if stop.returncode:
            return Verdict("STOP", "could not replace standard evaluation container")
    start = run(["docker", "run", "-d", "--name", cfg["container"], "-p", f"{cfg['port']}:8080", "-v", f"{p['output']}:/models:ro", cfg["image"],
                 "--model", cfg["model_name"], "--ctx-size", str(cfg["context"]), "--n-gpu-layers", "0"], cwd=project_root(base))
    if start.returncode:
        return Verdict("STOP", "could not start standard evaluation server")
    return Verdict("CONTINUE", f"standard Q8 endpoint ready at http://127.0.0.1:{cfg['port']}/v1")


def stage_q8(spec: dict[str, Any], base: Path, p: dict[str, Path]) -> Verdict:
    cfg = server_settings(spec, p)
    q8 = spec.get("q8", {})
    argv = ["npx", "tsx", "controller/scripts/functiongemma/cli.ts", "--base-url", f"http://127.0.0.1:{cfg['port']}/v1", "--model", cfg["model_name"], "--iterations", str(q8.get("iterations", 5)), "--scenarios-file", str(p["validation"]), "--out", str(p["q8_report"])]
    scenarios = q8.get("scenarios")
    if isinstance(scenarios, list) and scenarios:
        argv.extend(["--scenarios", ",".join(str(value) for value in scenarios)])
    result = run(argv, cwd=project_root(base))
    return report_verdict(p["q8_report"], "Q8 gate") if result.returncode == 0 else Verdict("STOP", "Q8 scorer failed")


def stage_soak(spec: dict[str, Any], base: Path, p: dict[str, Path]) -> Verdict:
    cfg = server_settings(spec, p)
    soak = spec.get("soak", {})
    result = run(["npx", "tsx", "controller/scripts/functiongemma/soak-cli.ts", "--base-url", f"http://127.0.0.1:{cfg['port']}/v1", "--model", cfg["model_name"], "--examples", str(soak.get("examples", 100)), "--out", str(p["soak_report"])], cwd=project_root(base))
    return report_verdict(p["soak_report"], "Q8 soak") if result.returncode == 0 else report_verdict(p["soak_report"], "Q8 soak")


STAGE_FUNCTIONS = {"prepare": stage_prepare, "train": stage_train, "native": stage_native, "convert": stage_convert, "serve": stage_serve, "q8": stage_q8, "soak": stage_soak}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", type=Path, required=True, help="Run specification JSON")
    parser.add_argument("--stage", choices=STAGES, help="Run one stage only")
    parser.add_argument("--from-stage", choices=STAGES, default="prepare", help="First stage when not using --resume")
    parser.add_argument("--resume", action="store_true", help="Start at the first unfinished or stopped stage")
    parser.add_argument("--yes", action="store_true", help="Accept non-failing stage prompts automatically")
    args = parser.parse_args()
    spec, base = load_spec(args.spec.resolve())
    p = paths(spec, base)
    if args.stage and args.resume:
        parser.error("--stage and --resume cannot be used together")
    if args.stage:
        selected = (args.stage,)
    elif args.resume:
        next_stage = next_unfinished_stage(p["state"])
        selected = () if next_stage is None else STAGES[STAGES.index(next_stage):]
    else:
        selected = STAGES[STAGES.index(args.from_stage):]
    if not selected:
        print("[workflow] CONTINUE — all stages are already complete")
        return 0
    os.environ["FUNCTIONGEMMA_WORKFLOW_LOG"] = str(p["output"] / "workflow-command.log")
    for stage in selected:
        verdict = STAGE_FUNCTIONS[stage](spec, base, p)
        write_state(p["state"], stage, status=verdict.recommendation.lower(), detail={"reason": verdict.reason})
        summary(stage, verdict)
        if not pause(stage, verdict, assume_yes=args.yes):
            return 0 if verdict.recommendation != "STOP" else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
