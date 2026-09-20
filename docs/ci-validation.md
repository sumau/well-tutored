# CI and pre-publish validation

The project uses separate checks for deterministic code quality, the running
development environment, and the published deployment.

## Deterministic CI validation

Run the complete repository verification with:

```sh
pnpm run verify:ci
```

This command runs, in order:

1. The test-database configuration guard tests.
2. The required test-database environment check.
3. Schema preparation against the dedicated `TEST_DATABASE_URL` connection.
4. The complete API server test suite, including database-backed workspace
   lifecycle integration tests.
5. Well Tutored web tests.
6. Smoke-check and publish-lifecycle tests.
7. `pnpm run build`, which checks documented commands, type-checks libraries
   and workspace packages, and builds the packages that define a build script.

The command stops at the first failure and returns a non-zero exit code. It is
the deterministic quality gate and does not depend on a running dev workflow
or a published URL.

The `ci` validation command is also registered in Replit's validation system
with `pnpm run verify:ci`. The registration is workspace-level configuration,
not a file committed to this repository, so keep `verify:ci` in the root
`package.json` as the source-controlled definition of the check. The command
uses an externally supplied `TEST_DATABASE_URL` when one is available.
Otherwise, it provisions a temporary local PostgreSQL cluster for the run,
exports its separate connection as `TEST_DATABASE_URL`, and removes the
cluster when validation finishes. It never falls back to `DATABASE_URL`.

CI is the only automated validation path that runs the database-backed API
integration suite. Those tests create, update, publish, and delete test
records, so they must use an isolated test database rather than a live
environment. The `ci` workflow rejects a value equal to `DATABASE_URL` and
applies the current schema to the test connection before the API suite starts.
If an external test URL is provided but is missing or the schema cannot be
applied, validation stops with an actionable test-database error instead of
falling back to the application database.

## Deployment gate

The root deployment configuration runs the build-free
`pnpm run verify:deploy` gate before the artifact-specific production builds.
A non-zero result stops the publish before the new build can go live. The
production artifact builds then run once through their normal deployment
configuration.

The deployment gate runs the API server's `test:deploy` script, which includes
only the non-mutating resource-type, publishability, and request-origin checks.
It does not run the workspace lifecycle integration suite and therefore does
not open a database connection for test setup. It also runs the web tests,
local smoke-check tests, documentation checks, and type checks. `verify:ci`
remains the complete pre-publish quality check, including the full API suite
and a full build.

## Development smoke validation

After the API and web development workflows are running, validate the
proxied development domain:

```sh
SMOKE_BASE_URL=https://$REPLIT_DEV_DOMAIN pnpm smoke:dev
SMOKE_BASE_URL=https://$REPLIT_DEV_DOMAIN pnpm smoke:enquiry
```

The development launch check validates health, catalogue data, public routes,
and invalid-enquiry recovery. It intentionally skips the Clerk Frontend API
proxy assertion because the API server only enables that proxy in production.
The browser check validates the enquiry flow with keyboard navigation,
validation recovery, retry behavior, and an announced success receipt. Its
requests are intercepted so it does not create a real enquiry.

The `dev-smoke` validation command is registered in Replit with the same
development-domain target and the `smoke:dev` mode. It expects
`REPLIT_DEV_DOMAIN` and fails rather than silently checking the wrong host when
that variable is unavailable.

Use the proxied development domain instead of a direct Vite port so the web
application and `/api` routes are checked together.

## Publishing validation

The publication lifecycle runs the published launch smoke check through the
root `postpublish` script:

```sh
pnpm run smoke:launch:published:lifecycle
```

The lifecycle receives the current Publishing URL through
`REPLIT_PUBLISHED_URL`, verifies that it matches the configured
`SMOKE_PRODUCTION_URL`, and then checks the published API and public pages.
The command fails if the URL is missing, malformed, mismatched, unhealthy, or
redirects to another origin.

This post-publish check remains necessary even after CI and dev validation:
deployment rewrites, production environment configuration, domains, and
published data can differ from development.

## Recommended release sequence

1. Run the `ci` validation command. It prepares and uses only the dedicated
   integration-test database for database-backed tests.
2. Start or refresh the API and web workflows.
3. Run the `dev-smoke` validation command.
4. Publish the app.
5. Confirm the post-publish launch smoke check passes.

The committed `Project` workflow runs `ci` and then `dev-smoke` sequentially.
This prevents development smoke checks from overlapping with CI's mutable
integration-test work. The dev smoke command is intentionally separate from
`verify:ci` because it depends on a live development environment. The published
check is intentionally separate because it validates the deployment that users
will access.