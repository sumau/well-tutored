# Deploying without Replit

Replit publishes this repository by running `pnpm run verify:deploy` and putting
its `router = "application"` in front of two artifacts, so the frontend and the
API share one domain. Nothing in the application code does that job. This
document covers deploying the same app to an ordinary container host instead.

The Replit path still works and is documented in [replit.md](../replit.md); the
two are not exclusive, but do not point both at the same database.

## What runs

One container. `docker/Dockerfile` builds the frontend, bundles the API, and
ships a runtime stage that serves both on a single port:

- `/api/*` — the Express API, unchanged
- `/api/__clerk/*` — the Clerk Frontend API proxy, active only when
  `NODE_ENV=production` and `CLERK_SECRET_KEY` is set
- everything else — the Vite build from `artifacts/well-tutored/dist/public`,
  with client-side routes falling back to `index.html`

**Keep it one origin.** Serving the frontend from a static host or CDN and the
API from somewhere else breaks three things at once: Clerk's session cookies are
same-origin, `requireTrustedMutationOrigin` rejects mutations whose `Origin` is
not this deployment's own, and the Clerk proxy signs its upstream requests with
the hostname the browser used. Splitting the two is possible but is not a
configuration this codebase currently supports.

Plus a PostgreSQL database, which every provider below offers as a managed
add-on.

## Configuration

| Variable | When | Notes |
| --- | --- | --- |
| `DATABASE_URL` | runtime, required | Append `?sslmode=require` for a hosted database: `lib/db/src/index.ts` creates a bare `pg` pool with no SSL options of its own. |
| `TRUSTED_ORIGINS` | runtime, required | The exact public origin, e.g. `https://well-tutored.fly.dev`. See below. |
| `PORT` | runtime, required | The image defaults it to `8080`. |
| `WEB_CLIENT_ROOT` | runtime, required here | The directory holding the frontend build; `docker/Dockerfile` sets it to `/app/web`. Leaving it unset makes the server skip serving the frontend entirely, which is what the Replit deployment relies on — so a container deployment that loses it answers every page with a 404 while `/api/healthz` stays green. It logs a warning in that state. |
| `CLERK_SECRET_KEY` | runtime, required | Not optional: the Clerk middleware fails every `/api` request with a 500 when it is absent, public endpoints included. A production key enables the Clerk proxy and workspace sign-in; a syntactically valid placeholder (`sk_test_` + 32 characters, as in `.env.example`) is enough to serve the public site. |
| `CLERK_PUBLISHABLE_KEY` | runtime | Used by the Clerk middleware. |
| `VITE_CLERK_PUBLISHABLE_KEY` | **build**, as a build argument | Compiled into the browser bundle. Setting it at runtime has no effect. |

`TRUSTED_ORIGINS` is the one that bites. On Replit, `getTrustedOrigins` falls
back to `REPLIT_DOMAINS`; off Replit that variable does not exist, and an empty
trusted-origin set rejects every credentialed request — including the public
enquiry POST, which is the main thing visitors do. Set it to the public origin,
with no trailing path, and update it when the domain changes. `APP_ORIGIN` works
as an alias.

The public site does not need *working* Clerk keys, but it does need
`CLERK_SECRET_KEY` to be present — see the table. With a placeholder, the
directory, resources and enquiry flow all work and `/workspace` simply cannot be
signed into. Pages themselves keep rendering either way, because the Clerk
middleware is mounted under `/api` only.

## Fly.io

`fly.toml` is committed and points at `docker/Dockerfile`.

```
fly launch --no-deploy        # rewrites `app`; keep the existing fly.toml
fly postgres create --name well-tutored-db
fly postgres attach well-tutored-db     # sets DATABASE_URL
fly secrets set CLERK_SECRET_KEY=sk_live_... CLERK_PUBLISHABLE_KEY=pk_live_...
```

Then set `TRUSTED_ORIGINS` in `fly.toml` to the hostname `fly launch` allocated,
put the publishable key in `[build.args]`, apply the schema (below), and:

```
fly deploy
```

The health check is already pointed at `/api/healthz`.

## Render, Railway, Cloud Run, or anything else

The same image works anywhere that runs a container and injects environment
variables. Build from the repository root — the Dockerfile copies the workspace,
so `docker/` is the wrong build context:

```
docker build -f docker/Dockerfile --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_... -t well-tutored .
```

Point the platform's health check at `/api/healthz` and let it supply `PORT` if
it insists on its own.

## Applying the schema

`scripts/post-merge.sh` is a Replit hook and does not run anywhere else, so
there is no automatic migration off Replit. Drizzle's `push` is the only
mechanism this project has; run it deliberately against the deployment database
from a checkout:

```
docker compose run --rm -e DATABASE_URL='postgres://...' --entrypoint bash migrate \
  -lc 'pnpm --filter @workspace/db run push'
```

`push` prompts before anything destructive — unlike the `push-force` the Replit
hook uses. Read the prompt. Review the diff of `lib/db/src/schema/` first, as
CLAUDE.md warns.

## Content

`ensureSeedContent()` only runs when `NODE_ENV=development`
(`artifacts/api-server/src/index.ts`), so a fresh deployment database has no
tutors or resources and the public directory renders empty. Either create content
through `/workspace` after bootstrapping an owner account — see
[workspace-owner-bootstrap.md](workspace-owner-bootstrap.md) — or copy an
existing database's data across.

### Copying data from another deployment

Apply the schema first (above), then copy data only. Drizzle stays the schema
authority, and a data-only dump is indifferent to the two servers' Postgres
versions and role names.

Run the client tools from a `postgres` image rather than the dev image, whose
`pg_dump` is version 15 and refuses a 16 server. Match the tag to the newer of
the two servers:

```
docker run --rm -e PGPASSWORD --entrypoint bash postgres:16 -c '
  pg_dump --data-only --no-owner --no-privileges "$SOURCE_URL" > /tmp/data.sql
  psql --single-transaction -v ON_ERROR_STOP=1 "$TARGET_URL" < /tmp/data.sql'
```

`--single-transaction` makes a partial copy impossible: any error rolls the whole
thing back. The dump orders table data by foreign-key dependency rather than by
name, so `tutors` lands before `resources` and `enquiries` without any help, and
it carries the `setval` calls that leave each sequence past the copied ids.

A target reachable only through `flyctl proxy` on the host needs
`--add-host=host.docker.internal:host-gateway` on that `docker run`, and the same
route is already configured for the `migrate` service in `docker-compose.yml`.

**Whether to copy `workspace_accounts` depends on Clerk.** The table's
`clerk_user_id` is `NOT NULL UNIQUE`, so those rows only mean anything to the
Clerk instance that issued them:

- **Same Clerk instance** — copy the whole database. Roles and tutor assignments
  come across, and no owner bootstrap is needed.
- **A different Clerk instance** — add
  `--exclude-table-data=workspace_accounts` to the `pg_dump`. Every other table
  is free of Clerk identifiers. Then sign in once on the deployment and run the
  guarded promote in [workspace-owner-bootstrap.md](workspace-owner-bootstrap.md).

  Copying the rows instead would lock you out rather than help: the new instance
  issues a different `clerk_user_id`, so signing in creates a second, pending
  account, while the stale `owner` row makes that document's `UPDATE` a no-op —
  its guard is `AND NOT EXISTS (SELECT 1 FROM workspace_accounts WHERE role =
  'owner')`.

This also means `pnpm run smoke:launch` fails against an empty deployment: it
asserts at least one published tutor and one published resource. That is the
check to run once there is content:

```
SMOKE_BASE_URL=https://your-domain pnpm run smoke:launch
```

## Workspace sign-in

`clerkMiddleware` is mounted under `/api`, not globally. Clerk answers a request
that accepts `text/html` with a handshake redirect when it cannot establish a
session, so a globally mounted Clerk would bounce every page load away from the
app now that this server serves the HTML — under Replit's router it only ever saw
API requests. The SPA authenticates client-side through `@clerk/react`.

### Which Clerk keys work on which hostname

`publishableKeyFromHost` decides this, and the SPA
(`artifacts/well-tutored/src/app/config.ts`) and the API (`app.ts`) both call it:

```js
if (fallbackKey && isDevelopmentFromPublishableKey(fallbackKey)) return fallbackKey;
return buildPublishableKey(`clerk.${hostname}`);
```

- A **development** key (`pk_test_…`) is used exactly as given, so Clerk is
  reached at `<slug>.clerk.accounts.dev` whatever the hostname. This is the only
  configuration that works on a hostname whose DNS you do not control, such as
  `*.fly.dev`, and it needs no records and no proxy.
- A **production** key (`pk_live_…`), or no key at all, is discarded: both sides
  derive a key for `clerk.<hostname>` instead. That expects the CNAME a Clerk
  production instance asks you to add, so it requires a domain of your own.

So stand the deployment up on development keys, and move to a production
instance when you attach a real domain — at which point `TRUSTED_ORIGINS`
becomes that domain too. Development instances show a notice in the sign-in UI,
share Clerk's OAuth credentials, and carry lower limits, so they are for getting
the deployment working rather than for live traffic.

The Frontend API proxy at `/api/__clerk` is a third path, and is not verified
here. It also needs a production instance — it attributes requests by host and a
dev instance answers `host_invalid` — and the frontend only routes through it
when `VITE_CLERK_PROXY_URL` is set, which nothing in this repository does, while
the API's `clerkMiddleware` passes no matching `proxyUrl`. Treat wiring it up as
work, not configuration.

## Verifying the image locally

The `prod` compose service runs the deployment image against the local
development database, which has seed content:

```
docker compose up --build prod      # http://localhost:8081
```

That covers the two things most likely to be wrong — whether the frontend is
actually served, and whether `TRUSTED_ORIGINS` permits an enquiry — without
deploying anything. The launch smoke check runs against it over the compose
network, and is the regression test for both:

```
docker compose run --rm --entrypoint bash api -lc 'SMOKE_BASE_URL=http://prod:8080 pnpm run smoke:dev'
```

It requests every public page with `Accept: text/html`, which is what caught the
Clerk handshake redirect described above. The rest of the suite is unchanged:
`docker compose run --rm test`, described in [local-docker.md](local-docker.md).

## What stays behind

`@replit/*` Vite plugins remain installed and inert: `vite.config.ts` only loads
the cartographer and dev-banner when `REPL_ID` is set, and the runtime error
modal is a development overlay. `postpublish`, `smoke:launch:published`, and the
`.replit` workflows are Replit-specific and are simply unused here.
