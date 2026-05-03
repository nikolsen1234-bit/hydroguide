# CLAUDE.md

See [AGENTS.md](AGENTS.md). Same procedure applies to Claude as to any other
agent.

When working in this repo as Claude:

1. Read `private/protocol.md` (after `git-crypt unlock`).
2. Run `node private/scripts/track.mjs start --agent claude --task "..."` first.
3. Use `note` during work, `finish` + `status` + `preflight` before commit.
4. Sign every commit with `[agent: claude]` on the last line.
