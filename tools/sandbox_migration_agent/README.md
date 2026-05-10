# Sandbox Migration Agent

Local HydroGuide migration harness based on OpenAI's sandbox-agent migration pattern.

The host process owns planning, credentials, orchestration, audit logs, and output validation. Each migration shard runs in its own staged workspace and returns review artifacts instead of changing the host checkout directly.

## Quick Check

```powershell
python tools\sandbox_migration_agent\run.py --manifest tools\sandbox_migration_agent\examples\hydroguide_manifest.json --backend local-copy --dry-run --workers 3
python tools\sandbox_migration_agent\evals.py --latest
```

## Local Codex Agent Mode

Use this when you want the logged-in Codex agent on this machine instead of an `OPENAI_API_KEY`.

```powershell
python tools\sandbox_migration_agent\run.py --manifest tools\sandbox_migration_agent\examples\hydroguide_manifest.json --backend local-copy --agent-runner codex --task backend-api-doc-shard --workers 1 --keep-workspaces --timeout-seconds 900
python tools\sandbox_migration_agent\evals.py --latest
```

For the first real run, start with `--workers 1`. Increase to `--workers 2` or `--workers 3` after one shard has produced a clean `migration.patch`.

## Backends

- `local-copy`: copies the selected shard into an isolated workspace. This is the default verification backend on this machine.
- `docker`: runs the shard in a Docker-backed sandbox. Docker must be installed and running.
- `e2b`: runs the shard in a hosted E2B sandbox. Requires `E2B_API_KEY`.
- `cloudflare`: runs the shard in a hosted Cloudflare sandbox worker. Requires `CLOUDFLARE_SANDBOX_WORKER_URL`.

Real model-backed migration also requires `OPENAI_API_KEY` and the OpenAI Agents SDK in the host Python environment.

Local Codex agent mode does not require `OPENAI_API_KEY`; it uses `codex exec` and your existing Codex login.

## Output

Each shard writes:

- `migration_result.json`
- `migration_report.md`
- `migration.patch`
- `migration_audit.jsonl`

The campaign writes `batch_summary.json` at the output root.
