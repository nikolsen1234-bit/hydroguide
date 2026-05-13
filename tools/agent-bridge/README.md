# HydroGuide Report Agent Bridge

Local Node bridge for `POST /api/report`.

The Cloudflare `hydroguide-report` Worker validates the existing report access
code and forwards sanitized report data through Cloudflare Tunnel to this
bridge. The bridge retrieves report knowledge from
`tools/agent-bridge/knowledge/report-knowledge.jsonl`, uses local Qwen
embeddings for vector retrieval, and calls Codex through CLIProxyAPI for the
final report supplement.

The tracked corpus manifest is
`tools/agent-bridge/knowledge/report-sources.manifest.json`. It points only at
official NVE and Lovdata sources for minstevannføring, IK-vassdrag, and the
current NVE water-resources-law guidance. Raw downloads and generated vectors
are cached under `.ai/agent-rag/` and are not tracked.

## Runtime

Required:

- `REPORT_BRIDGE_TOKEN` - bearer token expected from the Worker.
- CLIProxyAPI running locally, default `http://127.0.0.1:8317/v1`.
- Local embedding endpoint running, default `http://127.0.0.1:1234/v1`.

Optional:

- `REPORT_BRIDGE_HOST` - default `127.0.0.1`.
- `REPORT_BRIDGE_PORT` - default `8788`.
- `CLIPROXY_BASE_URL` - default `http://127.0.0.1:8317/v1`.
- `CLIPROXY_API_KEY` - optional local auth token for CLIProxyAPI.
- `REPORT_AGENT_MODEL` - preferred answer model name for CLIProxyAPI.
- `CLAUDE_MODEL` - optional fallback model name if CLIProxyAPI has Claude auth.
- `CODEX_MODEL` - optional fallback model name, default `gpt-5.4`.
- `REPORT_CODEX_TIMEOUT_MS` - local answer-agent timeout, default `110000`.
- `LOCAL_EMBEDDINGS_BASE_URL` - default `http://127.0.0.1:1234/v1`.
- `EMBEDDINGS_MODEL` - default `text-embedding-qwen3-embedding-4b`.
- `REPORT_EMBEDDINGS_BATCH_SIZE` - default `8`.
- `REPORT_EMBEDDINGS_TIMEOUT_MS` - timeout before keyword fallback, default `8000`.

## Commands

```powershell
python tools\agent-bridge\scripts\build-knowledge.py
node tools\agent-bridge\scripts\rebuild-index.mjs
node tools\agent-bridge\server.mjs
```

Runtime starter for live report generation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\agent-bridge\scripts\start-runtime.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\agent-bridge\scripts\ensure-runtime.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\agent-bridge\scripts\install-runtime-task.ps1
```

`start-runtime.ps1` starts CLIProxyAPI and the local bridge. It is now
manual-first: by default it does not start `cloudflared` and does not deploy
`hydroguide-report`. To expose the bridge publicly, set `REPORT_BRIDGE_URL` to
a stable HTTPS tunnel and run with `-DeployWorker`. `-AllowQuickTunnel` starts
an ad hoc public URL for explicit local testing.

`watch-runtime.ps1` is the long-running local watchdog. It checks CLIProxyAPI,
the local report bridge, and Cloudflare Tunnel health every 15 seconds. Auto
repair is disabled unless `REPORT_RUNTIME_AUTOREPAIR=1` is set.
`install-runtime-task.ps1` registers `ensure-runtime.ps1` at Windows logon; if
Task Scheduler access is denied it falls back to the current user's
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` startup entry.
`ensure-runtime.ps1` is also inert by default and only starts or repairs the
runtime when `REPORT_RUNTIME_AUTOSTART=1` is set.

Common manual commands:

```powershell
# local-only runtime on this PC
powershell -NoProfile -ExecutionPolicy Bypass -File tools\agent-bridge\scripts\start-runtime.ps1

# use a preconfigured stable tunnel URL and redeploy the Worker
$env:REPORT_BRIDGE_URL = "https://your-stable-bridge.example"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\agent-bridge\scripts\start-runtime.ps1 -DeployWorker

# start a quick tunnel explicitly
powershell -NoProfile -ExecutionPolicy Bypass -File tools\agent-bridge\scripts\start-runtime.ps1 -AllowQuickTunnel
```

`rebuild-index.mjs` runs the knowledge builder first unless
`REPORT_SKIP_KNOWLEDGE_BUILD=1` is set. It also preloads the LM Studio embedding
model so JIT loading does not use the global LM Studio context default. The
preload defaults are:

- `LMSTUDIO_EMBEDDINGS_GPU=off`
- `LMSTUDIO_EMBEDDINGS_CONTEXT=512`
- `LMSTUDIO_EMBEDDINGS_PARALLEL=1`
- `LMSTUDIO_EMBEDDINGS_TTL=3600`

Set `REPORT_SKIP_LMSTUDIO_PRELOAD=1` to use an already-loaded model manually.

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8788/health
```

Generated source caches and vectors are stored under `.ai/agent-rag/` and are
not tracked.
