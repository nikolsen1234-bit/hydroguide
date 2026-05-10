#!/usr/bin/env python
from __future__ import annotations

import argparse
import concurrent.futures
import fnmatch
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_ROOT = SCRIPT_DIR / "outputs"
DEFAULT_WORKSPACE_ROOT = SCRIPT_DIR / "workspaces"


@dataclass(frozen=True)
class MigrationTask:
    name: str
    repo_path: Path
    migration_brief: Path
    include_paths: tuple[str, ...]
    exclude_paths: tuple[str, ...]
    baseline_commands: tuple[str, ...]
    check_commands: tuple[str, ...]
    final_commands: tuple[str, ...]


@dataclass(frozen=True)
class CommandResult:
    command: str
    returncode: int
    stdout: str
    stderr: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in value).strip("-") or "task"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_manifest_path(manifest_path: Path, raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path.resolve()
    return (manifest_path.parent / path).resolve()


def normalize_task(manifest_path: Path, raw: dict[str, Any]) -> MigrationTask:
    def strings(key: str) -> tuple[str, ...]:
        value = raw.get(key, [])
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ValueError(f"{raw.get('name', '<unnamed>')}: {key} must be a list of strings")
        return tuple(value)

    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Each task needs a non-empty name")

    repo_path = resolve_manifest_path(manifest_path, str(raw.get("repo_path", "")))
    migration_brief = resolve_manifest_path(manifest_path, str(raw.get("migration_brief", "")))
    if not repo_path.exists():
        raise ValueError(f"{name}: repo_path does not exist: {repo_path}")
    if not migration_brief.exists():
        raise ValueError(f"{name}: migration_brief does not exist: {migration_brief}")

    return MigrationTask(
        name=safe_name(name),
        repo_path=repo_path,
        migration_brief=migration_brief,
        include_paths=strings("include_paths"),
        exclude_paths=strings("exclude_paths"),
        baseline_commands=strings("baseline_commands"),
        check_commands=strings("check_commands"),
        final_commands=strings("final_commands"),
    )


def load_tasks(manifest_path: Path) -> tuple[str, list[MigrationTask]]:
    manifest = read_json(manifest_path)
    tasks = manifest.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("Manifest must contain a non-empty tasks array")
    name = str(manifest.get("name") or manifest_path.stem)
    return name, [normalize_task(manifest_path, task) for task in tasks]


def is_excluded(relative_path: Path, patterns: tuple[str, ...]) -> bool:
    normalized = relative_path.as_posix()
    parts = PurePosixPath(normalized).parts
    for pattern in patterns:
        clean = pattern.strip().replace("\\", "/").strip("/")
        if not clean:
            continue
        if fnmatch.fnmatch(normalized, clean) or fnmatch.fnmatch(normalized, f"{clean}/*"):
            return True
        if clean in parts:
            return True
    return False


def copy_path(src_root: Path, dst_root: Path, relative: Path, excludes: tuple[str, ...]) -> None:
    if is_excluded(relative, excludes):
        return
    src = src_root / relative
    dst = dst_root / relative
    if src.is_dir():
        for child in src.rglob("*"):
            child_relative = child.relative_to(src_root)
            if is_excluded(child_relative, excludes):
                continue
            target = dst_root / child_relative
            if child.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            elif child.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(child, target)
    elif src.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


class SandboxProvider:
    name = "base"

    def stage(self, task: MigrationTask, workspace_root: Path) -> Path:
        raise NotImplementedError


class LocalCopyProvider(SandboxProvider):
    name = "local-copy"

    def stage(self, task: MigrationTask, workspace_root: Path) -> Path:
        workspace = workspace_root / task.name / "repo"
        if workspace.exists():
            shutil.rmtree(workspace)
        workspace.mkdir(parents=True, exist_ok=True)

        if task.include_paths:
            for item in task.include_paths:
                relative = Path(item)
                source = task.repo_path / relative
                if source.exists():
                    copy_path(task.repo_path, workspace, relative, task.exclude_paths)
        else:
            for child in task.repo_path.iterdir():
                copy_path(task.repo_path, workspace, child.relative_to(task.repo_path), task.exclude_paths)

        brief_target = workspace_root / task.name / "MIGRATION.md"
        brief_target.write_text(task.migration_brief.read_text(encoding="utf-8"), encoding="utf-8")
        return workspace


class UnavailableProvider(SandboxProvider):
    def __init__(self, name: str, reason: str) -> None:
        self.name = name
        self.reason = reason

    def stage(self, task: MigrationTask, workspace_root: Path) -> Path:
        raise RuntimeError(f"{self.name} backend is not available: {self.reason}")


def provider_for(name: str) -> SandboxProvider:
    if name == "local-copy":
        return LocalCopyProvider()
    if name == "docker":
        if shutil.which("docker") is None:
            return UnavailableProvider("docker", "docker executable was not found")
        return UnavailableProvider("docker", "Docker agent execution is not wired in this v1 harness")
    if name == "e2b":
        if not os.environ.get("E2B_API_KEY"):
            return UnavailableProvider("e2b", "E2B_API_KEY is not set")
        return UnavailableProvider("e2b", "E2B agent execution is not wired in this v1 harness")
    if name == "cloudflare":
        if not os.environ.get("CLOUDFLARE_SANDBOX_WORKER_URL"):
            return UnavailableProvider("cloudflare", "CLOUDFLARE_SANDBOX_WORKER_URL is not set")
        return UnavailableProvider("cloudflare", "Cloudflare sandbox execution is not wired in this v1 harness")
    raise ValueError(f"Unknown backend: {name}")


def run_command(command: str, cwd: Path, timeout_seconds: int) -> CommandResult:
    completed = subprocess.run(
        command,
        cwd=cwd,
        shell=True,
        text=True,
        capture_output=True,
        timeout=timeout_seconds,
        check=False,
    )
    return CommandResult(
        command=command,
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def append_audit(path: Path, event: str, **payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"time": utc_now(), "event": event, **payload}
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def command_records(results: list[CommandResult]) -> list[dict[str, Any]]:
    return [
        {
            "command": result.command,
            "returncode": result.returncode,
            "stdout_tail": result.stdout[-2000:],
            "stderr_tail": result.stderr[-2000:],
        }
        for result in results
    ]


def empty_patch() -> str:
    return "# Dry-run produced no patch.\n"


def run_process(args: list[str], cwd: Path, timeout_seconds: int, input_text: str | None = None) -> CommandResult:
    completed = subprocess.run(
        args,
        cwd=cwd,
        text=True,
        input=input_text,
        capture_output=True,
        timeout=timeout_seconds,
        check=False,
    )
    return CommandResult(
        command=" ".join(args),
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def initialize_patch_baseline(staged_repo: Path, timeout_seconds: int) -> list[CommandResult]:
    commands = [
        ["git", "init"],
        ["git", "config", "user.email", "codex@hydroguide.local"],
        ["git", "config", "user.name", "HydroGuide Codex Sandbox"],
        ["git", "add", "-A"],
        ["git", "commit", "-m", "Sandbox baseline"],
    ]
    results: list[CommandResult] = []
    for args in commands:
        result = run_process(args, staged_repo, timeout_seconds)
        results.append(result)
        if result.returncode != 0:
            raise RuntimeError(f"Failed to initialize sandbox git baseline: {result.command}")
    return results


def build_codex_prompt(task: MigrationTask, staged_repo: Path) -> str:
    brief = task.migration_brief.read_text(encoding="utf-8")
    checks = "\n".join(f"- `{command}`" for command in [*task.check_commands, *task.final_commands]) or "- no checks configured"
    return f"""You are running inside a staged copy of a HydroGuide migration shard.

Task: {task.name}
Workspace: {staged_repo}

Migration brief:
{brief}

Rules:
- Edit only this staged workspace.
- Do not touch the original HydroGuide checkout.
- Keep the change narrowly scoped to the brief.
- Run the relevant checks before finalizing.
- Leave reviewable file edits in this workspace; the host harness will collect git diff.

Configured checks:
{checks}
"""


def run_codex_agent(task: MigrationTask, staged_repo: Path, output_dir: Path, timeout_seconds: int) -> CommandResult:
    codex = shutil.which("codex")
    if codex is None:
        raise RuntimeError("codex CLI was not found on PATH")

    last_message_path = output_dir / "codex_last_message.md"
    prompt = build_codex_prompt(task, staged_repo)
    return run_process(
        [
            codex,
            "exec",
            "--cd",
            str(staged_repo),
            "--sandbox",
            "workspace-write",
            "--output-last-message",
            str(last_message_path),
            "-",
        ],
        cwd=staged_repo,
        timeout_seconds=timeout_seconds,
        input_text=prompt,
    )


def collect_patch(staged_repo: Path, timeout_seconds: int) -> str:
    result = run_process(["git", "diff", "--binary", "HEAD"], staged_repo, timeout_seconds)
    if result.returncode != 0:
        raise RuntimeError("Failed to collect sandbox git diff")
    return result.stdout or empty_patch()


def run_task(
    task: MigrationTask,
    provider_name: str,
    output_dir: Path,
    workspace_root: Path,
    dry_run: bool,
    agent_runner: str,
    keep_workspaces: bool,
    timeout_seconds: int,
) -> dict[str, Any]:
    provider = provider_for(provider_name)
    task_output = output_dir / task.name
    audit_path = task_output / "migration_audit.jsonl"
    task_workspace_root = workspace_root / task.name
    task_output.mkdir(parents=True, exist_ok=True)

    status = "completed"
    error: str | None = None
    baseline_results: list[CommandResult] = []
    agent_results: list[CommandResult] = []
    check_results: list[CommandResult] = []
    final_results: list[CommandResult] = []
    patch_text = empty_patch()

    append_audit(audit_path, "task_started", task=task.name, backend=provider_name, dry_run=dry_run)
    try:
        staged_repo = provider.stage(task, workspace_root)
        append_audit(audit_path, "workspace_staged", workspace=str(staged_repo))

        for command in task.baseline_commands:
            result = run_command(command, staged_repo, timeout_seconds)
            baseline_results.append(result)
            append_audit(audit_path, "baseline_command", command=command, returncode=result.returncode)
            if result.returncode != 0:
                raise RuntimeError(f"Baseline command failed: {command}")

        if dry_run:
            status = "dry_run"
            append_audit(audit_path, "agent_skipped", reason="dry_run")
        elif agent_runner == "codex":
            baseline_git_results = initialize_patch_baseline(staged_repo, timeout_seconds)
            agent_results.extend(baseline_git_results)
            append_audit(audit_path, "patch_baseline_initialized", commands=len(baseline_git_results))
            codex_result = run_codex_agent(task, staged_repo, task_output, timeout_seconds)
            agent_results.append(codex_result)
            append_audit(audit_path, "codex_agent_finished", returncode=codex_result.returncode)
            if codex_result.returncode != 0:
                raise RuntimeError("codex exec failed for staged shard")
            patch_text = collect_patch(staged_repo, timeout_seconds)
        else:
            raise RuntimeError("No agent runner selected. Use --dry-run or --agent-runner codex.")

        for command in task.check_commands:
            result = run_command(command, staged_repo, timeout_seconds)
            check_results.append(result)
            append_audit(audit_path, "check_command", command=command, returncode=result.returncode)
            if result.returncode != 0:
                raise RuntimeError(f"Check command failed: {command}")

        for command in task.final_commands:
            result = run_command(command, staged_repo, timeout_seconds)
            final_results.append(result)
            append_audit(audit_path, "final_command", command=command, returncode=result.returncode)
            if result.returncode != 0:
                raise RuntimeError(f"Final command failed: {command}")
    except Exception as exc:
        status = "failed"
        error = str(exc)
        append_audit(audit_path, "task_failed", error=error)
    finally:
        if not keep_workspaces and task_workspace_root.exists():
            shutil.rmtree(task_workspace_root, ignore_errors=True)
            append_audit(audit_path, "workspace_deleted", workspace=str(task_workspace_root))

    result_payload = {
        "task_name": task.name,
        "status": status,
        "backend": provider_name,
        "dry_run": dry_run,
        "error": error,
        "baseline_commands": command_records(baseline_results),
        "agent_commands": command_records(agent_results),
        "check_commands": command_records(check_results),
        "final_commands": command_records(final_results),
        "artifacts": {
            "report": "migration_report.md",
            "patch": "migration.patch",
            "audit": "migration_audit.jsonl",
        },
    }
    (task_output / "migration_result.json").write_text(
        json.dumps(result_payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (task_output / "migration.patch").write_text(patch_text, encoding="utf-8")
    (task_output / "migration_report.md").write_text(
        "\n".join(
            [
                f"# Migration Report: {task.name}",
                "",
                f"- Status: `{status}`",
                f"- Backend: `{provider_name}`",
                f"- Dry run: `{str(dry_run).lower()}`",
                f"- Error: `{error}`" if error else "- Error: none",
                "",
                "Patch review artifact: `migration.patch`.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    append_audit(audit_path, "task_finished", status=status)
    return {"name": task.name, "status": status, "error": error}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a parallel sandbox migration campaign.")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--backend", choices=("local-copy", "docker", "e2b", "cloudflare"), default="local-copy")
    parser.add_argument("--task", action="append", help="Run only the named task. Repeat to select multiple tasks.")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--agent-runner",
        choices=("none", "codex"),
        default="none",
        help="Agent runner to use for non-dry runs. 'codex' uses the local logged-in Codex CLI.",
    )
    parser.add_argument("--keep-workspaces", action="store_true")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--workspace-root", type=Path, default=DEFAULT_WORKSPACE_ROOT)
    args = parser.parse_args()

    if args.workers < 1:
        parser.error("--workers must be at least 1")

    manifest_path = args.manifest.resolve()
    campaign_name, tasks = load_tasks(manifest_path)
    if args.task:
        selected = {safe_name(name) for name in args.task}
        tasks = [task for task in tasks if task.name in selected]
        if not tasks:
            raise SystemExit(f"No manifest tasks matched: {', '.join(sorted(selected))}")
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = args.output_root.resolve() / run_id
    workspace_root = args.workspace_root.resolve() / run_id
    output_dir.mkdir(parents=True, exist_ok=True)
    workspace_root.mkdir(parents=True, exist_ok=True)

    started = time.time()
    print(f"Campaign: {campaign_name}")
    print(f"Tasks: {len(tasks)}")
    print(f"Workers: {args.workers}")
    print(f"Backend: {args.backend}")
    print(f"Output: {output_dir}")

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(
                run_task,
                task,
                args.backend,
                output_dir,
                workspace_root,
                args.dry_run,
                args.agent_runner,
                args.keep_workspaces,
                args.timeout_seconds,
            )
            for task in tasks
        ]
        summaries = [future.result() for future in concurrent.futures.as_completed(futures)]

    summaries.sort(key=lambda item: item["name"])
    failed = [summary for summary in summaries if summary["status"] == "failed"]
    batch_summary = {
        "campaign": campaign_name,
        "run_id": run_id,
        "backend": args.backend,
        "dry_run": args.dry_run,
        "agent_runner": args.agent_runner,
        "workers": args.workers,
        "duration_seconds": round(time.time() - started, 3),
        "tasks": summaries,
    }
    (output_dir / "batch_summary.json").write_text(
        json.dumps(batch_summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    if not args.keep_workspaces:
        shutil.rmtree(workspace_root, ignore_errors=True)

    print(f"Wrote {output_dir / 'batch_summary.json'}")
    if failed:
        print(f"Failed tasks: {len(failed)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
