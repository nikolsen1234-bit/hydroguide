# AGENTS.md

This file is read by AI coding agents (Codex, Claude, future tools) when they
start work in this repo.

## If you are a HydroGuide collaborator with the git-crypt key

Read `private/protocol.md` for the full agent procedure. It defines:

- Tracker commands you must run (`start`, `note`, `finish`, `status`, `preflight`).
- Commit message rules (including the required `[agent: ...]` signature).
- What pre-commit and pre-push hooks enforce.
- The shared documentation style for both Codex and Claude.

Setup instructions for a new collaborator machine are in `private/setup.md`.

## If you are reading this without git-crypt access

`private/` is encrypted on disk and unreadable. That is intentional. The public
HydroGuide system documentation lives in `README.md` and `docs/`. Use those.
