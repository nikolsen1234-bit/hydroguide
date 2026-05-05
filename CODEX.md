# CODEX.md

See [AGENTS.md](AGENTS.md). Same procedure applies to Codex as to any other
agent.

When working in this repo as Codex:

1. Read `private/protocol.md` (after `git-crypt unlock`).
2. Run `node private/scripts/track.mjs start --agent codex --task "..."` first.
3. Use `note` during work, `finish` + `status` + `preflight` before commit.
4. Sign every commit with `[agent: codex]` on the last line.

If the user asks to "fix setup", "fix onboarding", "fix this PC", or similar:

1. Read `private/setup.md` after git-crypt unlock.
2. Verify Git, Node 22, npm, git-crypt, `cd frontend && npm ci`,
   `git config --get core.hooksPath`, local Wrangler via `npx wrangler`,
   `node private/scripts/track.mjs status`, Cloudflare `npx wrangler whoami`,
   and `git status`.
3. Fix what can be fixed locally, including `npm ci` and
   `git config core.hooksPath .githooks`.
4. Do not write secrets into tracked files. Do not change `.secrets` or
   `backend/config/cloudflare.private.json` unless the user explicitly asks.
5. Report exact remaining blockers if OS installs, git-crypt unlock, or
   Cloudflare login require the user.
