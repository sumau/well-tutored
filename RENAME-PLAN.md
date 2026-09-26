# Renaming Well Tutored to Taught by Her

Working document. Tick each box as it lands, and delete this file (and the
`CLAUDE.md` section pointing at it) when step 6 is done.

Decisions behind this plan were settled in a design session on 2026-09-26. None
needs an ADR: a rename has no alternative a future reader will question.

## Decisions

| What | Value |
| --- | --- |
| Name in titles and copy | **Taught by Her** |
| Wordmark (header, logo text) | **taught by her**, lowercase, as "well tutored" is today |
| Technical name | `taughtbyher` everywhere: repo, Fly app, package, folder, compose project, local databases |
| Domains owned | `taughtbyher.co.uk` (primary), `taughtbyher.com` (redirects to it) — connected in a later step, not here |
| Copy where the name was the subject | Rewritten to "we" / "our team"; the name stays where it is a noun |
| Logo | Keep the mark, swap the text only; a real logo comes later |
| Neon | Rename the project label in the dashboard; the database and its connection strings stay as they are |
| `attached_assets/` | Left alone — a record of what was reviewed at the time |

## The shape

Six steps, in order. Steps marked **You** are dashboard or CLI actions only you
can take; steps marked **Claude** are PRs. Merging to `main` ships, so let each
PR's deploy and launch smoke go green before starting the next step.

The ordering constraint is hard: **the `taughtbyher` Fly app and its deploy
token must exist before PR 2 merges**, or the deploy targets an app that does
not exist.

---

## Step 1 — Rename the GitHub repo (You)

- [x] GitHub → `sumau/well-tutored` → Settings → rename to `taughtbyher`. Old
      URLs redirect; Actions secrets and open PRs survive.
- [x] Point the local clone at it, and check:

  ```
  git remote set-url origin https://github.com/sumau/taughtbyher.git
  git remote -v
  ```

## Step 2 — PR 1: the brand (Claude)

Everything a visitor sees. Deploys to the existing `well-tutored` app, which is
still correct at this point.

Change:

- `artifacts/well-tutored/index.html` — `<title>`, `og:title`, `twitter:title`.
- `artifacts/well-tutored/public/logo.svg` — `<title>` and the text element
  (`taught by her`). Check the text still fits its box.
- `src/components/layout/Shell.tsx` — both wordmarks, the © line, the under-18s
  notice. `WorkspaceLayout.tsx` — the wordmark.
- `src/app/route-map.ts` and `route-map.test.ts` — every page title and
  description, together.
- Copy: `pages/Home.tsx`, `pages/Enquiry.tsx`, `pages/TutorProfile.tsx`,
  `pages/auth/sign-in.tsx`, `components/EnquiryForm.tsx`,
  `artifacts/api-server/src/routes/enquiries.ts` (the `delivered` message), and
  `artifacts/mockup-sandbox/.../BookingSuccess.tsx`. Where the name is the
  subject of a sentence ("Well Tutored reviews the enquiry"), rewrite to "we" /
  "our team". List every rewritten sentence in the PR description.
- **`scripts/src/smoke-check.ts:337`** and `smoke-check.test.ts:67` — the launch
  smoke matches `<title>Well Tutored</title>` against the live site. It must
  change in this same PR, or the deploy job's smoke goes red straight after
  the merge.
- Prose name in `PROJECT.md`, `CONTEXT.md`, `docs/architecture.md`,
  `docs/ci-validation.md`, `docs/testing.md`, `docker/Dockerfile.dev`,
  `fly.toml` (header comment only).

Do **not** touch paths, package names, database names, hostnames or
`fly.toml`'s `app` — those are PR 2.

- [x] `docker compose run --rm test` passes
- [x] `grep -rn -i "well tutored"` is empty outside `attached_assets/`
- [x] PR merged, deploy + launch smoke green, `https://well-tutored.fly.dev`
      shows the new name

## Step 3 — Create the `taughtbyher` Fly app (You)

Fly apps cannot be renamed, so this is a new app beside the old one. Fly never
shows secret values back, so take them from the dashboards: the **pooled**
Neon connection string, and the Clerk development keys (the same ones the
current app uses — `fly.toml` already has the publishable one).

- [ ] Create the app and set its secrets. `read -rs` takes each value without
      echoing it or writing it to shell history; paste it and press Enter.
      The pooled string gets its own name so it cannot be confused with the
      direct `DATABASE_URL` you may have exported for schema work:

  ```
  read -rsp 'Pooled DATABASE_URL: ' POOLED_DATABASE_URL; echo
  read -rsp 'CLERK_SECRET_KEY: ' CLERK_SECRET_KEY; echo
  read -rsp 'CLERK_PUBLISHABLE_KEY: ' CLERK_PUBLISHABLE_KEY; echo

  fly apps create taughtbyher
  fly secrets set -a taughtbyher \
    DATABASE_URL="$POOLED_DATABASE_URL" \
    CLERK_SECRET_KEY="$CLERK_SECRET_KEY" \
    CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY"
  ```

- [ ] Leave the token until **just before merging PR 2**: a deploy token is
      scoped to one app, so once it is replaced, any other merge would fail to
      deploy `well-tutored`.

  ```
  fly tokens create deploy -a taughtbyher
  gh secret set FLY_API_TOKEN
  ```

## Step 4 — PR 2: the identifiers (Claude)

Everything internal. Merging it deploys to the new app.

Change:

- `git mv artifacts/well-tutored artifacts/taughtbyher`; the package becomes
  `@workspace/taughtbyher`. Fix every reference: its own `package.json` test
  script (`../well-tutored/…`), root `package.json` (`verify:ci:checks`),
  `vite.config.ts` (plugin name), `docker/Dockerfile` (build filter, the
  `dist/public` copy, the example tag), `docker-compose.yml` (header comment,
  `web` command), `web-client.test.ts` (`/srv/well-tutored/web`).
- Regenerate `pnpm-lock.yaml` with the pinned pnpm inside the container — its
  importer key changes, and CI and the deploy install with `--frozen-lockfile`.
- Remove the leftover `artifacts/well-tutored/` (gitignored `node_modules`,
  `dist`) from the working tree after the move.
- Databases `well_tutored` → `taughtbyher`, `well_tutored_test` →
  `taughtbyher_test`, `well_tutored_ci` → `taughtbyher_ci`, in
  `docker-compose.yml`, `.github/workflows/ci.yml` and
  `scripts/with-test-database.sh` (also its `mktemp` prefix).
- Compose project `name:` and both image names → `taughtbyher`.
- `fly.toml`: `app = "taughtbyher"` and
  `TRUSTED_ORIGINS = "https://taughtbyher.fly.dev"` — together.
- `ci.yml`: `SMOKE_BASE_URL` → `https://taughtbyher.fly.dev`, concurrency group
  → `deploy-taughtbyher`.
- Docs: every `well-tutored.fly.dev`, `fly apps create well-tutored`,
  `-t well-tutored`, `artifacts/well-tutored` and `@workspace/well-tutored` in
  `PROJECT.md` and `docs/` (`deploy.md`, `launch-smoke-check.md`,
  `ci-validation.md`, `testing.md`, `local-docker.md`, `architecture.md`,
  `agents/domain.md`). `CLAUDE.md` and `docs/agents/issue-tracker.md`: the repo
  becomes `sumau/taughtbyher`.

Local Docker afterwards — the compose rename means a fresh project, so clear
the old one first:

```
docker compose -p well-tutored down -v
docker compose build
docker compose run --rm migrate
```

- [ ] `docker compose run --rm test` passes, including `pnpm run docs:check`
- [ ] `grep -rn -i -E "well[-_ ]?tutored"` is empty outside `attached_assets/`
      and this file
- [ ] Step 3's token is set, then PR merged; deploy + launch smoke green
      against `https://taughtbyher.fly.dev`
- [ ] Open `https://taughtbyher.fly.dev/workspace` and sign in — the launch
      smoke waives the Clerk proxy check, so this is the only proof sign-in
      works on the new hostname

## Step 5 — Retire the old app and rename dashboards (You)

- [ ] `fly apps destroy well-tutored` — only after step 4 is green
- [ ] Neon: rename the project (label only)
- [ ] Clerk: rename the application — the name appears in Clerk's emails

## Step 6 — Move the local folder and Claude's memory (You, after the session)

Not from inside a Claude Code session running in the folder. Close it first.

- [ ] Move both:

  ```
  mv ~/Documents/well-tutored ~/Documents/taughtbyher
  mv ~/.claude/projects/-home-soumaya-mauthoor-Documents-well-tutored \
     ~/.claude/projects/-home-soumaya-mauthoor-Documents-taughtbyher
  ```

- [ ] Open a session in the new folder, have it update memory notes that name
      `well-tutored.fly.dev`, then delete this file and its `CLAUDE.md`
      section in a final small PR.

---

## Deliberately not in scope

- **Connecting the domains and switching Clerk to production.** The very next
  piece of work, and it gets its own design session (DNS, apex or `www`, how
  `.com` redirects). Do it **before** any workspace-owner bootstrap: the
  production instance reissues `clerk_user_id`, and while `workspace_accounts`
  is empty there is no stale `owner` row to clean up (`docs/deploy.md`,
  "Switching Clerk instances later"). The launch smoke's Clerk waiver can go
  at the same time.
- **A new logo.** The text swap holds until one is designed.
