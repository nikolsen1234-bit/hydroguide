# Coworker Onboarding Docs Design

Date: 2026-05-05

## Goal

Prepare HydroGuide for a trusted coworker who will work through normal GitHub collaboration and Cloudflare operator access. The repo remains owned by Nikolas as a personal GitHub repository. The coworker should be able to clone, unlock private material, use hooks, push branches, open pull requests, merge when allowed, inspect Cloudflare, and operate deploy/rollback routines without needing true GitHub co-owner/admin rights.

## Current State

- `docs/utvikling.md` is public and already explains normal local setup, `npm ci`, automatic `.githooks` activation, build/test commands, optional git-crypt, and a basic PR workflow.
- `private/setup.md` is encrypted with git-crypt and is intended for trusted coworker/sysadmin onboarding, but its Cloudflare access, deploy, and rotation sections are placeholders.
- `private/protocol.md` already defines the shared agent/hook protocol and the split between tracked public checks and encrypted private checks.
- `.githooks/` contains pre-commit, commit-msg, post-commit, and pre-push hooks.
- `.gitattributes` encrypts `.secrets`, `backend/config/cloudflare.private.json`, and `private/**`.
- The GitHub repository is a personal repo, so there is one real owner and collaborators with write access. Collaborator access is enough for normal branches, PRs, and merges, but not for owner-only repository administration.

## Public Documentation Design

`docs/utvikling.md` remains public and contributor-oriented. It should not contain private handoff details, real people-specific permission grants, tokens, operational key transfer details, or Cloudflare account secrets.

Update it only to clarify the public developer path:

- First-time setup: clone, install dependencies, run builds/tests.
- Hook activation: `npm ci` runs the prepare script and sets `core.hooksPath` to `.githooks`.
- Hook verification: show how to confirm `git config core.hooksPath` and how to recognize a blocked low-quality commit message.
- Git workflow: branch from current `main`, commit with a real message, push branch, open PR, merge only after checks pass.
- git-crypt: describe it as optional for normal public development and required only for trusted operators who need `.secrets`, `backend/config/cloudflare.private.json`, or `private/**`.
- Link to Cloudflare docs for public architecture and deploy concept, but keep actual operational access in private docs.

## Private Documentation Design

`private/setup.md` becomes the primary trusted coworker onboarding runbook. It should be practical, sequenced, and complete enough that the coworker can verify their machine without asking for every command.

Required sections:

- Access model:
  - GitHub remains a personal repo owned by Nikolas.
  - Coworker receives collaborator/write access, not true co-owner/admin rights.
  - Collaborator can clone, push branches, open PRs, manage issues/PRs, and merge when repository rules allow.
  - Owner-only actions stay with Nikolas: visibility changes, inviting collaborators, repository settings, deploy keys, webhooks, transfer/delete/archive, security/advisory settings.
- First-time GitHub setup:
  - Accept collaborator invite.
  - Clone the repo.
  - Confirm remotes and branch.
  - Use feature branches, not direct risky work on `main`.
- git-crypt setup:
  - Install current git-crypt for the platform without pinning stale release text.
  - Receive `git-crypt-key` through a private channel.
  - Never store the key in the repo, chat, email, or public docs.
  - Run `git-crypt unlock <path>`.
  - Verify with `git-crypt --version`, `git-crypt status`, reading `.secrets`, and reading `private/protocol.md`.
  - Explain what encrypted files are expected: `.secrets`, `backend/config/cloudflare.private.json`, and `private/**`.
- Local hooks and tracker:
  - Run `cd frontend && npm ci`.
  - Verify `git config core.hooksPath` returns `.githooks`.
  - Explain that public hooks run for everyone, while private hooks run only after git-crypt unlock.
  - Run `node private/scripts/track.mjs status`.
  - Point to `private/protocol.md` for agent-specific start/note/finish/preflight rules.
- Cloudflare access:
  - Recommend Cloudflare `Administrator` if the coworker only needs deploy/ops capability.
  - Use `Super Administrator - All Privileges` only if they must manage members, billing, purchases, or account-owned API tokens.
  - List Cloudflare areas they should be able to inspect: Workers Builds, `hydroguide-api`, `hydroguide-report`, `hydroguide-ai`, `hydroguide-admin`, KV, R2, WAF/rate/cache/header rules, Secrets Store, logs, rollback/deployments.
- Deploy and rollback:
  - State that normal Worker deploys are Git-connected through Cloudflare Workers Builds, not GitHub Actions.
  - Keep deploy order: `hydroguide-ai`, `hydroguide-api`, `hydroguide-report`, `hydroguide-admin`.
  - Explain local manual deploy is backup/operator workflow requiring decrypted private config and Cloudflare token.
  - Describe rollback location in Cloudflare Dashboard and link to the public Cloudflare doc for architecture details.
- Token and rotation routine:
  - Cloudflare secrets are primary; local `.secrets` is encrypted backup.
  - Tokens pasted in chat or used outside normal flow must be rotated.
  - `ADMIN_TOKEN`, Worker secrets, and `CLOUDFLARE_API_TOKEN` should never enter public docs or tracked plaintext.
  - Add a short "when in doubt, rotate" rule and record who performed the rotation in private notes without writing secret values.
- First-day verification checklist:
  - Repo cloned.
  - `npm ci` succeeds.
  - hooks active.
  - git-crypt unlocked.
  - private docs readable.
  - tracker status works.
  - branch/PR workflow tested with a small doc change.
  - Cloudflare dashboard access confirmed.
  - Worker build/deploy logs visible.

## Protocol Documentation Design

`private/protocol.md` should stay focused on agent and commit procedure. It does not need a large rewrite.

Add only a small cross-reference if needed:

- First-time machine and coworker onboarding belongs in `private/setup.md`.
- Daily agent procedure remains in `private/protocol.md`.

## GitHub Permission Design

The intended model is personal-repo collaborator access:

- Nikolas remains owner and admin.
- Coworker is added as collaborator.
- Branch protection/rules should carry the real safety boundary instead of relying on admin role separation.
- Recommended repository rules for `main`:
  - Require pull request before merging.
  - Require status checks from CI.
  - Block force pushes and deletion.
  - Require branch to be up to date before merge where practical.
  - Keep squash merge as the preferred merge method if that is the current repository convention.

## Cloudflare Permission Design

Use least privilege while keeping the setup operational:

- Start with Cloudflare `Administrator` for deploy/ops work if member management and billing are not required.
- Escalate to `Super Administrator - All Privileges` only if the coworker must manage other members, billing, purchases, or account-owned tokens.
- The private docs should say which role was actually granted and when to revisit it.

## Verification Plan

After implementation, verify:

- Public docs contain no secrets, private tokens, or coworker-only private handoff details.
- `private/setup.md` has complete access, deploy, and rotation sections.
- `private/setup.md` clearly states GitHub collaborator limits and Cloudflare role choice.
- Hook setup instructions match the actual repo behavior.
- `npm run build` or the relevant docs checks are run if the changed files trigger repo checks.
- `node private/scripts/track.mjs status --agent codex` and `preflight --agent codex` are run before final handoff.

## Out Of Scope

- Moving the repo to a GitHub Organization.
- Making the coworker a true GitHub co-owner/admin.
- Changing Cloudflare resources or rotating real tokens during this docs pass.
- Reworking the agent tracking system or hook scripts unless current docs contradict existing behavior.
