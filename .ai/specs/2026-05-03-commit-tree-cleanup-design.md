# Commit Tree Cleanup Design

Date: 2026-05-03
Status: approved in chat for planning

## Goal

Clean the current dirty working tree carefully without hiding functional Cloudflare changes inside a generic documentation cleanup.

The cleanup must produce a readable commit history, keep local/generated artifacts out of git, and avoid staging secrets or encrypted private config unless that is approved separately.

## Current Shape

The dirty tree is not documentation-only. It contains:

- A Cloudflare Worker reorganization from old combined Worker paths to separated API, report, AI, and admin Workers.
- New untracked source paths under `backend/workers/`, `backend/admin/`, `backend/api/report.js`, and `backend/cloudflare/`.
- Deletions of old paths under `backend/api-worker/`, `backend/api/keys/index.js`, `backend/api/polish-report.js`, and `backend/config/wrangler.jsonc`.
- Runtime binding and route renames such as `/api/polish-report` to `/api/report`, `PROMPT_KV` to `REPORT_RULES`, `R2_BUCKET` to `AI_REFERENCE_BUCKET`, and `MINIMUMFLOW_R2` to `MINIMUM_FLOW_BUCKET`.
- Large documentation and README rewrites that explain the new layout.
- Local or private state in `.secrets`, `backend/config/cloudflare.private.json`, and `.understand-anything/`.

`.understand-anything/` is local analysis state and must stay ignored.

## Recommended Commit Design

### Commit 1: `chore: reorganize Cloudflare workers`

This commit owns the real runtime and deployment shape:

- Add the new Worker entrypoints and admin handler.
- Add source Wrangler configs from `backend/cloudflare/*.wrangler.jsonc`.
- Keep generated Wrangler configs ignored.
- Keep the deletions of retired Worker/config files.
- Include workflow, frontend route rename, local Vite bridge updates, AI binding rename, config generator updates, maintenance script updates, and public Cloudflare metadata.
- Include `.gitignore` changes needed for the new layout.

Do not include `.secrets` or `backend/config/cloudflare.private.json` in this commit.

### Commit 2: `docs: align documentation with Cloudflare worker layout`

This commit owns human-facing explanation only:

- `README.md`
- `docs/ai-dokumentasjon.md`
- `docs/arkitektur.md`
- `docs/backend-dokumentasjon.md`
- `docs/cloudflare-dokumentasjon.md`
- `docs/frontend.md`

The docs should use concrete names and avoid stale terms:

- No `/api/polish-report` as the active report route.
- No `PROMPT_KV` as the active report rules KV binding.
- No `R2_BUCKET` as the active AI reference bucket binding.
- No `hydroguide-w-r2` as the active AI Worker name.
- No `backend/api-worker` as the active Worker source path.

## Sensitive Files

`.secrets` and `backend/config/cloudflare.private.json` are not part of the normal cleanup commits.

If either file must be committed, it must be handled as a separate explicit encrypted/private-config commit after a separate approval. Until then, they remain local dirty state.

## Local Artifacts

`.understand-anything/` is ignored and must not be staged.

Generated Worker configs matching `backend/cloudflare/*.generated.wrangler.jsonc` are ignored and must not be staged.

## Verification

Before any final cleanup commit:

- Run `node .ai\scripts\check-secrets.mjs`.
- Run `node backend\scripts\build-cloudflare-worker-config.mjs --check-public`.
- Run `node backend\scripts\build-cloudflare-worker-config.mjs --check-deploy-config`.
- Run the Cloudflare route/config test for `backend/cloudflare/wrangler-routes.test.mjs`.
- Run `git diff --check`.

Before claiming the job is finished, run tracker `finish`, `status`, and `preflight`.

## Commit Safety

Use explicit path staging. Do not use broad `git add .`.

Review staged diff before each commit.

Keep unrelated local state dirty rather than reverting it.

Do not delete or reset files unless the user approves that exact action.
