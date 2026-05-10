#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_TASK_ARTIFACTS = (
    "migration_result.json",
    "migration_report.md",
    "migration.patch",
    "migration_audit.jsonl",
)


def latest_output_dir(output_root: Path) -> Path:
    candidates = [path for path in output_root.iterdir() if path.is_dir()]
    if not candidates:
        raise SystemExit(f"No output directories found under {output_root}")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def validate_output(output_dir: Path) -> None:
    summary_path = output_dir / "batch_summary.json"
    if not summary_path.exists():
        raise SystemExit(f"Missing {summary_path}")

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    tasks = summary.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise SystemExit("batch_summary.json must contain a non-empty tasks list")

    for task in tasks:
        name = task.get("name")
        if not isinstance(name, str) or not name:
            raise SystemExit("Each task summary needs a name")
        task_dir = output_dir / name
        if not task_dir.is_dir():
            raise SystemExit(f"Missing task output directory: {task_dir}")
        for artifact in REQUIRED_TASK_ARTIFACTS:
            artifact_path = task_dir / artifact
            if not artifact_path.exists():
                raise SystemExit(f"Missing artifact: {artifact_path}")
            if artifact_path.stat().st_size == 0 and artifact != "migration.patch":
                raise SystemExit(f"Empty artifact: {artifact_path}")

        result = json.loads((task_dir / "migration_result.json").read_text(encoding="utf-8"))
        if result.get("task_name") != name:
            raise SystemExit(f"Task name mismatch in {task_dir / 'migration_result.json'}")
        if result.get("status") not in {"dry_run", "completed", "failed"}:
            raise SystemExit(f"Invalid status for {name}: {result.get('status')}")

        audit_lines = [
            line for line in (task_dir / "migration_audit.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if not audit_lines:
            raise SystemExit(f"Audit log has no events: {task_dir}")
        for line in audit_lines:
            json.loads(line)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate sandbox migration campaign artifacts.")
    parser.add_argument("--output", type=Path, help="Campaign output directory to validate.")
    parser.add_argument("--latest", action="store_true", help="Validate the newest directory under outputs/.")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path(__file__).resolve().parent / "outputs",
        help="Output root used with --latest.",
    )
    args = parser.parse_args()

    if args.latest:
        output_dir = latest_output_dir(args.output_root)
    elif args.output:
        output_dir = args.output
    else:
        parser.error("Pass --output or --latest")

    validate_output(output_dir.resolve())
    print(f"OK: {output_dir}")


if __name__ == "__main__":
    main()
