# Removing Replit

Working document. Delete it when the last change below has landed.

Decisions behind this plan were settled in a design session on 2026-09-21. The
ones a future reader will question are recorded in
[docs/adr/0001-single-origin-deployment.md](docs/adr/0001-single-origin-deployment.md)
and [docs/adr/0002-schema-by-deliberate-push.md](docs/adr/0002-schema-by-deliberate-push.md);
the vocabulary is in [CONTEXT.md](CONTEXT.md).

## The shape

Three changes, in order. The ordering constraint is hard: **the deploy path has
to exist and be proven before the Replit path is deleted**, or there is a window
with no way to ship at all.

1. **Add the deploy path.** Additive. Replit keeps working throughout.
2. **Delete Replit.** Only after a merge to `main` has actually deployed.
3. **Rename the `studio_account_role` enum.** Unrelated to the migration, and
   cheap only while `workspace_accounts` is empty.

## Before change 1: two things only you can do

Change 1 cannot prove itself until these exist. They are the first thing in that
PR's description, not a footnote.

```
fly tokens create deploy
gh secret set FLY_API_TOKEN
```

---

## Change 1 — Add the deploy path

### The content-free launch smoke

Every smoke mode currently asserts at least one published Tutor
(`scripts/src/smoke-check.ts`, the `/api/tutors` check). `--dev` only skips the
Clerk proxy check. So all three modes fail against the Fly deployment, which is
deliberately empty. Fix by making the content assertions waivable:

- `scripts/src/smoke-check.ts` — add an `--allow-empty` flag. When set, skip the
  non-empty assertions on `/api/tutors` and on each Tutor's Resources, and push
  them onto the existing `skipped` list the way `--dev` does for the Clerk proxy.
  Everything else still runs: `/api/healthz`, every public page requested with
  `Accept: text/html`, the SPA fallback. Those are the assertions that earn
  their keep — requesting pages as HTML is what caught the Clerk handshake
  redirect.
- `scripts/src/smoke-check.test.ts` — cover the flag, both directions.
- `scripts/package.json` — add a script invoking the flag.
- `package.json` — add the matching root-level script that delegates to it.

The flag is named for the condition under which passing it is correct, not for
what it skips: a stale one in CI reads as a bug later. When content exists, the
CI step drops back to the ordinary launch smoke and both script entries get
deleted — two lines.

### The deploy job

`.github/workflows/ci.yml` gains a `deploy` job:

- `needs: verify`, and `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`.
- Its own `concurrency` group that does **not** cancel in progress. The existing
  group cancels PR runs, which is right for verification and wrong for a deploy
  you have half-shipped.
- Checkout, flyctl, `flyctl deploy` using `FLY_API_TOKEN`. No build arguments
  needed: `fly.toml` already carries `VITE_CLERK_PUBLISHABLE_KEY` under
  `[build.args]`, which is correct — Vite compiles it into the bundle at build
  time, and a Fly secret would not exist yet.
- Then the launch smoke with the waiver flag, pointed at
  `SMOKE_BASE_URL=https://well-tutored.fly.dev`. It needs Node, pnpm and an
  install, but no browser: the launch smoke is `fetch`-based. The Playwright
  enquiry smoke is a separate script and stays out of CI.

It does **not** apply the schema. That is ADR-0002, and it is the point.

### Proving it

Merge, watch the deploy job go green, confirm the site still answers. Only then
start change 2.

---

## Change 2 — Delete Replit

### Files that go entirely

- `.replit`, `.replitignore`, `scripts/post-merge.sh`
- `artifacts/well-tutored/.replit-artifact/` (its `artifact.toml`)
- `scripts/src/publish-smoke.ts` and `scripts/src/publish-smoke.test.ts`
- `.agents/memory/replit-publish-smoke-validation.md`

### Scripts

Root `package.json`: drop `postpublish`, `smoke:launch:published`,
`smoke:launch:published:lifecycle`, `smoke:enquiry:published` and
`verify:deploy`. Drop the `@replit/connectors-sdk` dependency — it has zero
imports anywhere in the repo.

`scripts/package.json`: drop `smoke:published`, `smoke:published:lifecycle` and
`smoke:enquiry:published`; remove `publish-smoke.test.ts` from `test:smoke`.

`artifacts/api-server/package.json`: `test:deploy` is aliased to `test:unit` and
referenced only by `verify:deploy`. It goes too; `docs/testing.md:126` and
`docs/ci-validation.md:102` reference it and need updating.

### Two behaviour changes to be deliberate about

**`smoke:launch` will require `SMOKE_BASE_URL`.** `resolveConfiguredBaseUrl()`
currently falls back to `resolveArtifactProductionUrl()`, which reads
`.replit-artifact/artifact.toml`. Deleting that file removes the **default
target for every invocation**, not just the `--published` path. Make the missing
variable a clear error rather than a confusing one.

**The stale-hostname check disappears.** `--published` mode compares the
publishing URL against the artifact's configured production URL, to catch a
domain change that was not propagated. Nothing replaces it. With one committed
origin in `fly.toml` and `TRUSTED_ORIGINS` beside it, an unpropagated change is
now a visible config diff rather than a silent drift — an acceptable loss, but a
loss.

### Runtime

`artifacts/api-server/src/middlewares/request-origin.ts` — collapse
`configuredValues()` to `TRUSTED_ORIGINS` / `CORS_ORIGINS` plus the localhost
defaults in development. Delete `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`,
`APP_ORIGIN`, `PUBLIC_APP_ORIGIN` and `PUBLIC_APP_URL` — five names resolving in
a documented precedence order, for a deployment that sets exactly one of them.
Update `request-origin.test.ts` to match.

`normalizeOrigin()` coerces bare domains to `https://` because `REPLIT_DOMAINS`
was domain-only. Keep the leniency, rewrite the comment: it no longer has a
reason, it has a habit.

Comments describing Replit's router in the present tense:
`artifacts/api-server/src/lib/web-client.ts` (four), `app.ts:74`,
`artifacts/well-tutored/vite.config.ts:19`, `web-client.test.ts`.

### Build

Both `vite.config.ts` files: remove the `@replit/vite-plugin-runtime-error-modal`
import and its `runtimeErrorOverlay()` call — note this one is **not** gated on
`REPL_ID` and currently runs in local Docker development too, so this is a real
change to your dev experience, not dead code. Also remove the `REPL_ID`-gated
cartographer and dev-banner blocks, which are already inert off Replit.

`pnpm-workspace.yaml`: drop the three `@replit/*` catalog entries, and the
`minimumReleaseAgeExclude` entries (`@replit/*`, `stripe-replit-sync`). Keep the
platform `overrides` that prune non-linux-x64 binaries — the constraint survives
(CI is `ubuntu-latest`, the images are linux-x64) even though its stated reason
does not. Rewrite the comment to cite CI and the Docker images.

Regenerate `pnpm-lock.yaml`. Both the deploy build and CI install with
`--frozen-lockfile`.

`scripts/src/enquiry-browser-smoke.ts` defaults Chromium to
`/repl/tools/bin/chromium` — a Replit path that plain grep for "replit" misses.
Point it at the image's Chromium or make `SMOKE_CHROMIUM_PATH` required.

### The doc gate

`scripts/src/docs-check.ts` — `validateWorkflowReferences` only ever reads
`.replit`, so deleting it makes the function dead code and silently shrinks what
the gate covers. Repoint it at `.github/workflows/*.yml`, validating `run:`
steps that invoke `pnpm run <script>`. The value transfers exactly and is about
to matter more, because the deploy job calls `pnpm` scripts too. Parsing `run:`
out of YAML is less code than the hand-rolled TOML walk it replaces. Update
`docs-check.test.ts`, and the `replit.md` special-case at line 67.

### Documentation

- **`replit.md` → `PROJECT.md`**, rewritten: the Replit deployment sections die,
  the stack / where-things-live / gotchas sections survive. Update `CLAUDE.md`'s
  pointer and the `docs-check.ts` special case.
- **`docs/deploy.md`** — retitle from "Deploying without Replit" to "Deploying".
  Delete the Replit comparison in the opening, "Copying data from another
  deployment" (the Replit data is being abandoned) and "What stays behind" (it
  lists `@replit/*` residue that will not exist). Move the rationale — why one
  origin, why not Fly Postgres, why development Clerk keys — into ADR-0001 so
  the document instructs rather than argues. Expect roughly half its 387 lines.
- **`CLAUDE.md`** — the "Replit is still the deployment" section goes entirely.
  Keep the lockfile note (still true: CI, `Dockerfile.dev` and `package.json`
  must agree). Add one line stating that **merging to `main` now ships to
  production** — newly true, and the most important thing for anything editing
  this repo to know. The destructive-schema warning moves to ADR-0002 and
  `docs/deploy.md`, where the command actually lives.
- **`docs/launch-smoke-check.md`** — the heaviest rewrite after `deploy.md`.
  Roughly half of it documents `REPLIT_PUBLISHED_URL`, `SMOKE_PUBLISHED_URL`,
  the artifact.toml target and the published/lifecycle variants.
- **`docs/testing.md`** and **`docs/ci-validation.md`** — remove `verify:deploy`
  and `test:deploy`, including the Mermaid node in `testing.md:21`.
- **`docs/review_docs.md`** — references `replit.md` at lines 3 and 67, and
  Replit workspaces at 31 and 74.
- **`.env.example`** — the `CLERK_SECRET_KEY` comment explains itself in terms of
  Replit's Clerk integration.
- **`docker-compose.yml`** lines 1 and 149, **`docker/Dockerfile`** line 2,
  **`docker/Dockerfile.dev`** line 16 — one Replit comment each.
- **`.agents/memory/`** — rewrite `development-smoke-checks.md`,
  `local-browser-smoke-routing.md` and `deployment-build-database-target.md`;
  update `MEMORY.md` for the deleted note.
- **`docs/workspace-owner-bootstrap.md`** — unchanged. It passes through.

### Verification

`docker compose run --rm test`, then `pnpm run docs:check` specifically — the
doc rewrites are the most likely thing to break the gate, and it runs inside
`build`. Then merge and watch the deploy.

---

## Change 3 — Rename the `studio_account_role` enum

Separate from the migration, and sequenced after it so that manual `push` is
unambiguously the only path to the database.

`Workspace` has a dead synonym living in the schema: the enum is
`studio_account_role` and the constraints are `studio_accounts_clerk_user_id_unique`
and `studio_accounts_tutor_id_unique`, while the table is `workspace_accounts`
and every TypeScript identifier says `workspaceAccount`.

**There is a deadline.** This is cheap only while `workspace_accounts` is empty.
`push` diffs states rather than replaying history, so an enum rename is not a
rename to it — it is a drop and recreate of the type, under a column with a
`NOT NULL DEFAULT 'pending'`. Against an empty table, uneventful. The table
stops being empty when the automated owner bootstrap runs, which is sequenced
after the production Clerk switch.

Before pointing it at the deployment, confirm against the local development
database how `push` actually plans this — whether it prompts, or silently plans
the drop and recreate. Minutes, and worth knowing beforehand rather than during.

Rename the constraints in the same change, or one stale name becomes two. Drop
the note at `docs/architecture.md:43` that documents the discrepancy.

---

## Deliberately not in scope

- **The automated workspace-owner bootstrap.** Sequenced after the production
  Clerk switch, because the Clerk instance change reissues `clerk_user_id` and
  writing it now means writing it against an identity that expires.
- **A custom domain and production Clerk keys.** A few weeks out. At that point
  `TRUSTED_ORIGINS` and `app` in `fly.toml` change together, and the stale
  `owner` row has to be deleted before promoting on the new instance — see
  `docs/deploy.md`.
- **Generated migrations.** The expected upgrade path from ADR-0002, not adopted
  alongside a deployment move.
