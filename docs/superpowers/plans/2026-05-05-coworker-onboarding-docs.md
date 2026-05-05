# Coworker Onboarding Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update HydroGuide docs so public development instructions stay public-safe while trusted coworker onboarding has complete private git-crypt, hooks, GitHub, and Cloudflare operator guidance.

**Architecture:** Keep public contributor setup in `docs/utvikling.md`; put operational handoff in encrypted `private/setup.md`; keep `private/protocol.md` focused on daily agent/commit procedure with a small onboarding cross-reference. No real secrets or account IDs are added.

**Tech Stack:** Markdown docs, GitHub personal repository collaborator workflow, git-crypt, Git hooks, Cloudflare Workers Builds, KV, R2, WAF/rate/cache/header rules, Secrets Store.

---

## File Structure

- Modify `docs/utvikling.md`: public developer guide. Clarify hook setup, collaborator branch/PR workflow, and optional git-crypt without private operational details.
- Modify `private/setup.md`: encrypted coworker/sysadmin onboarding runbook. Replace placeholder-style access/deploy/rotation sections with complete current guidance.
- Modify `private/protocol.md`: encrypted agent protocol. Add one short first-time onboarding cross-reference only if it improves discoverability.
- Do not modify `.secrets`, `backend/config/cloudflare.private.json`, `.githooks/*`, or real Cloudflare resources.

---

### Task 1: Public Developer Guide Cleanup

**Files:**
- Modify: `docs/utvikling.md`

- [ ] **Step 1: Read the current public guide**

Run:

```powershell
Get-Content -Path docs\utvikling.md -TotalCount 260
```

Expected: the file shows "Lokal utvikling", requirements, first-time setup, hook verification, git-crypt, commit procedure, frontend/backend/pipeline commands, and troubleshooting.

- [ ] **Step 2: Update the first-time setup section**

In `docs/utvikling.md`, keep the public setup flow but make the hook behavior explicit and current. The section under `## Forstegangs oppsett` should include this content in natural Nynorsk/Norwegian style:

```markdown
`npm ci` i `frontend/` kjører repoets `prepare`-script. Det setter `core.hooksPath` til `.githooks`, slik at pre-commit-, commit-msg-, post-commit- og pre-push-hookene brukes automatisk i denne klonen.

Verifiser fra repo-roten:

```bash
git config --get core.hooksPath
```

Forventet svar:

```text
.githooks
```
```

Do not add private collaborator names, private key transfer details, Cloudflare account IDs, or token values.

- [ ] **Step 3: Clarify public collaborator workflow**

In `docs/utvikling.md`, update `## Forste ekte commit` so the public workflow is clearly:

```markdown
1. Oppdater `main`: `git pull --rebase origin main`
2. Lag en branch: `git checkout -b <kort-beskrivende-navn>`
3. Gjør en liten endring.
4. Stage: `git add <fil>`
5. Commit med en skikkelig melding: `git commit -m "Fix typo in docs"`
6. Push: `git push -u origin <kort-beskrivende-navn>`
7. Lag PR mot `main` på GitHub.
8. Merge først når CI er grønn og eventuelle review-krav er oppfylt.
```

Mention that collaborators can work through branches and PRs, while repository administration belongs to the owner. Keep this generic, not person-specific.

- [ ] **Step 4: Keep git-crypt public-safe**

In the git-crypt subsection, keep it optional for normal development and required only for trusted operator work. It should say:

```markdown
Vanlig frontend-, backend- og dokumentasjonsarbeid trenger ikke git-crypt. Trusted operator-arbeid som bruker `.secrets`, `backend/config/cloudflare.private.json` eller `private/**` krever git-crypt og nøkkel fra maintainer via privat kanal.
```

Do not explain exact key delivery beyond "privat kanal" in the public doc.

- [ ] **Step 5: Verify public doc has no private details**

Run:

```powershell
Select-String -Path docs\utvikling.md -Pattern 'CLOUDFLARE_API_TOKEN|ADMIN_TOKEN|git-crypt-key|Nikolas sender|backend/config/cloudflare.private.json.*token|Super Administrator'
```

Expected: no output, except `CLOUDFLARE_API_TOKEN` may appear only in generic troubleshooting text that does not include values. If the command returns private handoff wording, remove it from the public doc.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add docs/utvikling.md
git commit -m "Clarify public development onboarding

[agent: codex]"
```

Expected: commit passes public checks and private checks.

---

### Task 2: Private Coworker Setup Runbook

**Files:**
- Modify: `private/setup.md`

- [ ] **Step 1: Read the private setup doc**

Run:

```powershell
Get-Content -Path private\setup.md -TotalCount 260
```

Expected: the file contains git-crypt setup and agent process, with access/deploy/rotation sections needing complete current guidance.

- [ ] **Step 2: Replace the opening and access model**

At the top of `private/setup.md`, state that this is the trusted coworker/sysadmin onboarding runbook. Add an access model section with:

```markdown
## Tilgangsmodell

HydroGuide ligger i et personlig GitHub-repo eid av Nikolas. En coworker får collaborator/write-tilgang, ikke ekte co-owner/admin-rolle i GitHub.

Dette er nok for normalt arbeid:

- clone repoet
- pushe egne branches
- åpne pull requests
- reviewe og håndtere PR-er/issues
- merge når repository-regler tillater det

Dette blir owner-only hos Nikolas:

- gjøre repoet privat/offentlig
- invitere eller fjerne collaborators
- endre repository settings, deploy keys, webhooks og branch/ruleset settings
- transfer, archive eller delete repoet
- endre security/advisory-administrasjon
```

- [ ] **Step 3: Update git-crypt installation wording**

Replace stale Windows wording that pins `git-crypt-0.7.0-x86_64.exe` with current, non-stale wording:

```markdown
**Windows:**
Last ned nyeste Windows-build av `git-crypt` fra `https://github.com/AGWA/git-crypt/releases`, legg `git-crypt.exe` i en mappe på `PATH`, for eksempel `C:\Users\<din-bruker>\bin\`, og åpne ny terminal.
```

Keep Mac and Linux package-manager instructions. Keep `git-crypt --version`.

- [ ] **Step 4: Expand git-crypt verification**

After `git-crypt unlock <path-til-git-crypt-key>`, add:

```markdown
Verifiser:

```bash
git-crypt status
cat .secrets
cat backend/config/cloudflare.private.json
cat private/protocol.md
```

Forventet:

- `.secrets` viser klartekst.
- `backend/config/cloudflare.private.json` viser JSON i klartekst.
- `private/protocol.md` er lesbar Markdown.
- `git-crypt status` viser `.secrets`, `backend/config/cloudflare.private.json` og `private/**` som krypterte filer.
```

Also state clearly that `git-crypt-key` must never be stored in the repo, email, Slack/chat, or public docs.

- [ ] **Step 5: Add first-time local hooks/tracker checklist**

Add a section:

```markdown
## Første lokale sjekk etter clone

```bash
cd frontend
npm ci
cd ..
git config --get core.hooksPath
node private/scripts/track.mjs status
```

Forventet:

- `git config --get core.hooksPath` svarer `.githooks`.
- `track.mjs status` skriver lokal agentstatus uten feil.
- Public hooks kjører for alle.
- Private hooks kjører bare etter `git-crypt unlock`, fordi `private/scripts/` da er lesbar.
```

- [ ] **Step 6: Replace Cloudflare access placeholder**

Replace `## Cloudflare-tilgang` placeholder with:

```markdown
## Cloudflare-tilgang

Start med Cloudflare-rollen `Administrator` hvis coworker bare skal gjøre drift, deploy, rollback, se logger og kontrollere Workers/KV/R2/WAF/regler.

Bruk `Super Administrator - All Privileges` bare hvis coworker også må:

- invitere eller fjerne Cloudflare-medlemmer
- håndtere billing eller purchases
- administrere account-owned API tokens
- overta full account-administrasjon

Coworker skal kunne se og verifisere:

- Workers Builds
- `hydroguide-api`
- `hydroguide-report`
- `hydroguide-ai`
- `hydroguide-admin`
- KV: `API_KEYS`, `REPORT_RULES`
- R2: `hydroguide-minimum-flow`, `hydroguide-ai-reference`, `hydroguide-assets`
- WAF custom rules, managed rules, rate limit, cache rules og response header transform
- Secrets Store og Worker secrets uten å lime verdier inn i chat eller public docs
- Worker logs, deployments og rollback
```

- [ ] **Step 7: Replace deploy placeholder**

Replace `## Deploy-rutiner` placeholder with:

```markdown
## Deploy-rutiner

Normal Worker-deploy går via Cloudflare Workers Builds koblet til GitHub-repoet. GitHub Actions deployer ikke Workers og skal ikke ha `CLOUDFLARE_API_TOKEN`.

Deploy-rekkefølge:

1. `hydroguide-ai`
2. `hydroguide-api`
3. `hydroguide-report`
4. `hydroguide-admin`

`hydroguide-report` bruker service binding mot `hydroguide-ai`, så `hydroguide-ai` er første Worker i deploy-rekkefølgen.

For manuell lokal deploy må disse være på plass:

- git-crypt er unlocked
- `backend/config/cloudflare.private.json` er lesbar
- `.secrets` eller miljøet har nødvendig Cloudflare token
- generert deploy-config finnes fra `node backend/scripts/build-cloudflare-worker-config.mjs --write-deploy-config`

Rollback gjøres i Cloudflare Dashboard under aktuell Worker -> Deployments. Velg en kjent god deployment og aktiver den. Ved config-feil på `main`: revert commit på `main`, push, og la Workers Builds bygge på nytt.
```

- [ ] **Step 8: Replace rotation placeholder**

Replace `## Roterings-rutiner` placeholder with:

```markdown
## Roterings-rutiner

Cloudflare secrets er primærkilde for drift. Lokal `.secrets` er kryptert backup.

Roter ved tvil:

- token er limt inn i chat, issue, PR, logg eller terminaloutput som andre kan se
- token er brukt på feil maskin eller utenfor normal drift
- coworker mister tilgang eller slutter
- Cloudflare eller GitHub varsler om mulig lekkasje

Verdier som aldri skal inn i public docs eller tracked plaintext:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_API_TOKEN_ID`
- `ADMIN_TOKEN`
- `API_KEY_HASH_SECRET`
- `REPORT_ACCESS_CODE_HASH`
- `REPORT_WORKER_TOKEN`
- `AI_GATEWAY_AUTH_TOKEN`
- `AI_SEARCH_API_TOKEN`

Etter rotasjon:

1. Oppdater verdien i Cloudflare der den faktisk brukes.
2. Oppdater lokal `.secrets` hvis den skal være backup.
3. Verifiser relevant Worker/deploy.
4. Skriv en kort privat note om at rotasjon er gjort, uten å skrive secret-verdien.
```

- [ ] **Step 9: Add first-day checklist**

Add:

```markdown
## Første dag sjekkliste

- [ ] GitHub invite akseptert.
- [ ] Repo klonet.
- [ ] `cd frontend && npm ci` kjører uten feil.
- [ ] `git config --get core.hooksPath` svarer `.githooks`.
- [ ] git-crypt er unlocked.
- [ ] `.secrets`, `backend/config/cloudflare.private.json` og `private/protocol.md` er lesbare.
- [ ] `node private/scripts/track.mjs status` fungerer.
- [ ] En liten doc-branch kan pushes og åpnes som PR.
- [ ] Cloudflare Dashboard viser Workers Builds og alle fire Workers.
- [ ] Coworker kan se Worker logs og Deployments.
```

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add private/setup.md
git commit -m "Complete private coworker setup runbook

[agent: codex]"
```

Expected: commit passes public checks and private checks.

---

### Task 3: Protocol Cross-Reference

**Files:**
- Modify: `private/protocol.md`

- [ ] **Step 1: Add a short onboarding pointer**

Near `## Start Of Work`, add:

```markdown
For first-time machine setup, git-crypt unlock, Cloudflare access, and coworker onboarding, read `private/setup.md` first. This protocol starts after the repo is cloned, private files are readable, and hooks are active.
```

Do not duplicate the setup runbook in `private/protocol.md`.

- [ ] **Step 2: Commit Task 3**

Run:

```bash
git add private/protocol.md
git commit -m "Link protocol to private onboarding setup

[agent: codex]"
```

Expected: commit passes public checks and private checks.

---

### Task 4: Final Verification

**Files:**
- Verify: `docs/utvikling.md`
- Verify: `private/setup.md`
- Verify: `private/protocol.md`

- [ ] **Step 1: Check public doc for sensitive terms**

Run:

```powershell
Select-String -Path docs\utvikling.md -Pattern 'git-crypt-key|ADMIN_TOKEN|API_KEY_HASH_SECRET|REPORT_WORKER_TOKEN|AI_GATEWAY_AUTH_TOKEN|AI_SEARCH_API_TOKEN|Super Administrator|Nikolas sender'
```

Expected: no output.

- [ ] **Step 2: Check private setup has no old placeholder lines**

Run:

```powershell
Select-String -Path private\setup.md -Pattern 'Fyll inn etter behov|TODO|TBD|placeholder'
```

Expected: no output.

- [ ] **Step 3: Run docs/style-sensitive hooks through a no-op preflight**

Run:

```bash
node private/scripts/track.mjs status --agent codex
node private/scripts/track.mjs preflight --agent codex
```

Expected: preflight passes or only reports unrelated existing local private config changes.

- [ ] **Step 4: Check final Git state**

Run:

```bash
git status --short --branch
```

Expected: only pre-existing private local changes remain unstaged:

```text
 M .secrets
 M backend/config/cloudflare.private.json
```

If implementation commits are ahead of origin, report the commit SHAs and do not push unless explicitly asked.

---

## Self-Review Notes

- Spec coverage: public docs, private setup, protocol cross-reference, GitHub collaborator limits, Cloudflare role choice, git-crypt, hooks, deploy, rollback, token rotation, and verification are each mapped to tasks.
- Placeholder scan: the plan intentionally contains commands to search for placeholder words; it does not instruct the implementer to leave placeholders in the docs.
- Scope check: this is one documentation pass and does not change GitHub settings, Cloudflare resources, tokens, hooks, or encrypted secret values.
