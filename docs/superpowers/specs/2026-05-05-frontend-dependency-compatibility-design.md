# Frontend Dependency Compatibility Design

Date: 2026-05-05

## Goal

Bring the HydroGuide frontend dependency set forward without changing app behavior, visual design, deployment flow, or public API behavior. The work is split into small compatibility passes so each major dependency family can be verified and, if needed, rolled back independently.

## Current Context

The frontend is a Vite React app in `frontend/`. It currently uses React 18, React Router 6, Tailwind 3, TypeScript 5, Vite 8, PostCSS, autoprefixer, and Wrangler. Routing is centralized in `frontend/src/main.tsx` and `frontend/src/App.tsx`. Tailwind uses `frontend/tailwind.config.ts`, `frontend/postcss.config.cjs`, and `frontend/src/index.css`.

The previous Dependabot branches were closed after safe GitHub Actions updates were applied directly to `main`. The remaining frontend updates are major-version compatibility work, not blind dependency bumps.

## Scope

This compatibility pass must:

- Keep app behavior and visual output unchanged.
- Upgrade dependencies in separate focused passes.
- Preserve existing file boundaries and local project patterns.
- Leave `.secrets` and `backend/config/cloudflare.private.json` untouched.
- Avoid UI redesign, deployment changes, public API changes, and unrelated refactors.
- Stop and document a blocker if a major upgrade requires broader migration work.

## Pass A: Low-Risk Tooling

Update low-risk toolchain packages first:

- `wrangler`
- `postcss`
- `autoprefixer`

Expected changes are limited to `frontend/package.json` and `frontend/package-lock.json`. This pass should not change frontend source code unless the build exposes a direct compatibility issue.

Verification:

- `npm ci` in `frontend`
- `npm run build` in `frontend`
- Repo hygiene checks for hardcoded IDs, console/debug output, postMessage, and Worker config
- Git diff confirms only intended dependency files changed

## Pass B: React 19 And React Router 7

Update runtime packages:

- `react`
- `react-dom`
- `@types/react`
- `@types/react-dom`
- `react-router-dom`

The app already uses `ReactDOM.createRoot` and React Router v7 future flags. Expected source changes should be small. Routing should stay in `frontend/src/main.tsx` and `frontend/src/App.tsx`.

Verification:

- `npm ci` in `frontend`
- `npm run build` in `frontend`
- Confirm lazy-loaded routes compile
- Check core routes: `/`, `/oversikt`, `/system`, `/analyse`, `/siktlinje-radio`, `/api`
- Look for blank page, navigation errors, route redirects, and provider/rendering regressions

## Pass C: Tailwind 4 And TypeScript 6

Handle Tailwind 4 and TypeScript 6 last because they are the highest-risk updates.

Tailwind 4 may require changes to PostCSS integration, CSS entry directives, or config shape. The design goal is to preserve the current custom theme behavior, including `brand-*` colors, `shadow-soft`, and `rise` animation utilities.

TypeScript 6 may expose stricter type errors. Fix only compatibility errors that block build, keeping existing module boundaries and component structure.

Verification:

- `npm ci` in `frontend`
- `npm run build` in `frontend`
- Confirm generated CSS still includes project-specific Tailwind output
- Check the same core routes as Pass B
- Inspect visible styling enough to catch missing Tailwind output or broken custom theme utilities

## Branch And Dependabot Cleanup

After a successful pass, push `main` and close/delete any Dependabot branch or PR that the pass supersedes. If Dependabot recreates a major-version PR that is intentionally deferred, close it with a note that the migration is tracked separately.

## Success Criteria

The work is successful when:

- `main` builds after each accepted pass.
- Repo checks pass after each accepted pass.
- Only intended files are changed in each commit.
- `origin` has only `main` after cleanup.
- Any deferred major upgrade has a clear blocker note instead of an unreviewed open branch.

## Out Of Scope

- Redesigning HydroGuide UI.
- Changing app copy.
- Changing Cloudflare Worker architecture or deploy flow.
- Changing public API routes or endpoint behavior.
- Reworking unrelated frontend modules for style or preference.
