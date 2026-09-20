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

Plus a PostgreSQL database, which is a separate decision from the container
host — see **Choosing a database** below.

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

`TRUSTED_ORIGINS` is the one that bites. On Replit, and only when
`NODE_ENV=production`, `getTrustedOrigins` falls back to `REPLIT_DOMAINS`; off
Replit that variable does not exist, and an empty trusted-origin set rejects
every credentialed request — including the public enquiry POST, which is the
main thing visitors do. Set it to the public origin, with no trailing path, and
update it when the domain changes.

`configuredValues` in `artifacts/api-server/src/middlewares/request-origin.ts`
reads several names, and they are not interchangeable:

- `TRUSTED_ORIGINS` and `CORS_ORIGINS` are the explicit tier. Either one being
  set **replaces** everything below, so the deployment fails closed rather than
  silently widening access.
- `APP_ORIGIN`, `PUBLIC_APP_ORIGIN` and `PUBLIC_APP_URL` are consulted only when
  neither of those is set. They are a fallback, not an alias: set
  `TRUSTED_ORIGINS` as well and these are ignored entirely.
- `REPLIT_DOMAINS` (production) and `REPLIT_DEV_DOMAIN` plus the localhost
  defaults (everywhere else) sit below those again.

Set `TRUSTED_ORIGINS` and ignore the rest.

The public site does not need *working* Clerk keys, but it does need
`CLERK_SECRET_KEY` to be present — see the table. With a placeholder, the
directory, resources and enquiry flow all work and `/workspace` simply cannot be
signed into. Pages themselves keep rendering either way, because the Clerk
middleware is mounted under `/api` only.

## Fly.io

`fly.toml` is committed and points at `docker/Dockerfile`.

Fly runs the container. The database comes from somewhere else — see **Choosing
a database** below, and have its `DATABASE_URL` in hand before deploying.

```
fly apps create well-tutored
fly secrets set DATABASE_URL='postgres://...?sslmode=require' \
  CLERK_SECRET_KEY=sk_test_... CLERK_PUBLISHABLE_KEY=pk_test_...
```

`fly launch --no-deploy` also works, but it rewrites the committed `fly.toml`
from its own guesses; `git diff fly.toml` afterwards and revert what it changed.
`fly apps create` only reserves the name, which is all this repository needs.

Then set `TRUSTED_ORIGINS` in `fly.toml` to the hostname you were allocated — it
must match exactly, or every credentialed request is rejected, the public
enquiry POST included — put the publishable key in `[build.args]`, apply the
schema (below), and:

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

## Choosing a database

Anything that speaks Postgres works. `lib/db/src/index.ts` builds a bare `pg`
pool from `DATABASE_URL` with no SSL options of its own, so a hosted database
needs `?sslmode=require` appended to the connection string.

**Neon or Supabase** are the shortest path. Both have a free tier, both take
real backups, and — the part that matters operationally — both are reachable
over the public internet. Every step that runs from a local checkout (the schema
push below, seeding, copying data in) then needs no tunnel at all. Create a
database, copy the connection string, append `?sslmode=require`, and set it as a
Fly secret.

**Fly Managed Postgres** keeps the database on the same bill and the same
private network as the app:

```
fly mpg create --name well-tutored-db --region lhr
fly mpg attach <cluster-id> -a well-tutored   # sets DATABASE_URL to the pooled URL
```

`attach` points `DATABASE_URL` at the PGBouncer-pooled connection, which is the
one you want for a web app. Two things to plan for, though. Plans started at
$38/month when this was written, so check the current price before assuming Fly
is the cheap option. And the cluster is not reachable over the public internet:
anything run from a checkout needs `fly mpg proxy` open first, with
`DATABASE_URL` pointed at the local port it prints.

**`fly postgres create`** is the older unmanaged flavour — a Postgres app in
your own organisation. Fly's documentation now states they cannot support or
advise on it, and it is daily volume snapshots only, so a hardware failure loses
everything written since the last one. `enquiries` is the table that makes that
unacceptable: tutors and resources can be recreated through `/workspace`, but an
enquiry that arrives and is lost is gone.

## Applying the schema

`scripts/post-merge.sh` is a Replit hook and does not run anywhere else, so
there is no automatic migration off Replit. Drizzle's `push` is the only
mechanism this project has; run it deliberately against the deployment database
from a checkout:

```
docker compose run --rm -e DATABASE_URL='postgres://...' --entrypoint bash migrate \
  -lc 'pnpm --filter @workspace/db run push'
```

This runs from your machine to the database. Secrets set on the deployment host
play no part in it, so the connection string has to be supplied here.

Three things about that command:

- **`-e DATABASE_URL` is load-bearing.** `docker-compose.yml` sets
  `DATABASE_URL` on the `migrate` service to the local development database, and
  an explicit `environment:` entry beats anything from `.env`. Omit the
  override and you push to your local container instead of the deployment,
  successfully and silently.
- **`?sslmode=require`** belongs on the connection string for any hosted
  database, for the reason in the configuration table above.
- **Prefer a direct connection over a pooled one** for DDL. Neon and Supabase
  both hand out two URLs; the pooled endpoint (Neon marks it with `-pooler` in
  the hostname) is the one for the running app. For Fly Managed Postgres, whose
  `attach` sets the pooled URL, this is one more reason the push goes through
  `fly mpg proxy` rather than the attached variable.

`push` prompts before anything destructive — unlike the `push-force` the Replit
hook uses. Read the prompt. Review the diff of `lib/db/src/schema/` first, as
CLAUDE.md warns. Against an empty database there is nothing to drop, so a prompt
there means the connection string is not pointing where you think it is.

Check what landed:

```
docker compose run --rm -e DATABASE_URL='postgres://...' --entrypoint bash migrate \
  -lc 'psql "$DATABASE_URL" -c "\dt"'
```

`tutors`, `resources`, `enquiries` and `workspace_accounts` should all be
listed.

## Content

`ensureSeedContent()` only runs when `NODE_ENV=development`
(`artifacts/api-server/src/index.ts`), so a fresh deployment database has no
tutors or resources and the public directory renders empty. There are three ways
on from there: deploy empty and create content through `/workspace`, seed the
illustrative content, or copy an existing database's data across.

### Deploying against an empty database

Perfectly workable, and the shortest path to a deployment you can log into. Two
things behave differently and neither is a fault:

- The directory and resource library render their empty states, and `/api/tutors`
  returns an empty list.
- `pnpm run smoke:launch` **fails**, because it asserts at least one published
  tutor and one published resource. It aborts there, so it never reaches the page
  and enquiry checks either. Until there is content, check `/api/healthz` and load
  `/` by hand; the smoke check becomes meaningful again once the database has
  something in it.

To get the illustrative tutors and resources without copying a database, point
the development API at the deployment database: its `dev` script sets
`NODE_ENV=development`, which is the condition the seeding is gated on. With a
tunnel to that database open, override `DATABASE_URL` on the `api` service and
interrupt it once it logs that it is listening. Seeding is idempotent, so a
repeat run changes nothing.

### Switching Clerk instances later

Standing the deployment up on a development instance and moving to a production
one when a domain arrives means your Clerk user ID changes, so budget one step
for it. Tutors, resources, drafts and enquiries are untouched — none of them
reference Clerk. Your `workspace_accounts` row is the exception: the new instance
issues a different `clerk_user_id`, so signing in creates a second, pending
account, and the stale `owner` row makes the `UPDATE` in
[workspace-owner-bootstrap.md](workspace-owner-bootstrap.md) a no-op, since it is
guarded by `AND NOT EXISTS (SELECT 1 FROM workspace_accounts WHERE role =
'owner')`. Delete the stale row first, then sign in on the new instance and
promote again.

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

A target reachable only through a tunnel on the host — `fly mpg proxy`, or any
other — needs `--add-host=host.docker.internal:host-gateway` on that `docker
run`, with the host's port in `$TARGET_URL` as `host.docker.internal`. The same
route is already configured for the `migrate` service in `docker-compose.yml`. A
publicly reachable database needs none of this.

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
