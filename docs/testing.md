# Testing

The project uses several complementary test layers. Most automated tests use
Node's built-in `node:test` runner and are executed with `tsx`; the web tests
also use JSDOM where browser APIs are needed.

For the complete pre-publish validation setup, including Replit validation
commands, see [CI and pre-publish validation](ci-validation.md).

## Test suites

### API server

Run the API tests with:

```sh
pnpm --filter @workspace/api-server test
```

This is the complete API suite used by CI. It runs the in-memory unit checks
and the database-backed workspace lifecycle integration tests. The lifecycle
tests cover:

- Workspace tutor, resource, article, account, and permission lifecycles,
  including owner-only behavior and Clerk identity reuse.

Run only the non-mutating API checks with:

```sh
pnpm --filter @workspace/api-server run test:unit
```

These checks cover:

- Publishability rules for tutor profiles and resources.
- Supported and legacy resource type normalization.
- Request-origin normalization and protection against cross-site workspace
  mutations.

The lifecycle tests exercise the Express routes and database-backed behavior
end to end within the test process. They create, update, publish, and delete
test records and are therefore reserved for CI with an isolated test
database.

The deployment gate uses the API server's non-mutating deployment check:

```sh
pnpm --filter @workspace/api-server run test:deploy
```

This is intentionally separate from the complete `test` command so publishing
never runs database setup or mutation tests against the deployment database.

### Web application

Run the Well Tutored web tests with:

```sh
pnpm --filter @workspace/well-tutored test
```

The suite checks:

- Public and workspace route resolution, metadata, redirects, and Clerk
  callback routes.
- Homepage loading, successful tutor rendering, and retry behavior.
- Tutor profile behavior, including unavailable tutors.
- Enquiry form validation, keyboard navigation, focus management, disabled
  submit behavior, announced errors, retry behavior, and successful receipts.
- Public tutor-query caching, expiry, and mutation invalidation.
- Workspace authentication loading, approved, pending, error, and retry
  states.

React components are rendered either into JSDOM or to static markup. Network
and query behavior is supplied by test doubles rather than making real
production requests.

### Repository scripts

The script package tests the smoke-check and documentation-check helpers:

```sh
pnpm --filter @workspace/scripts run test:smoke
```

The smoke-check tests validate URL selection, published deployment metadata,
redirect protection, timeout handling, and healthy responses against a local
fixture. The documentation tests ensure documented `pnpm` commands refer to
real package scripts.

## Static verification

Run the repository-wide type checks with:

```sh
pnpm run typecheck
```

Run the normal build verification with:

```sh
pnpm run build
```

The build first checks documented commands, then type-checks libraries and
workspace packages, and finally builds the packages that define a build script.
The mockup sandbox has no test script; it is covered by its TypeScript
type-check and build when those workspace checks run.

## Launch and browser smoke checks

The non-mutating launch smoke check verifies a running target's API health,
Clerk environment proxy, published tutor and resource catalogue data, public
pages, invalid-enquiry validation, and recovery health check:

```sh
pnpm smoke:launch
```

For a published deployment, pass the current Publishing URL:

```sh
SMOKE_PUBLISHED_URL=https://example.replit.app pnpm smoke:launch:published
```

The published check rejects missing or mismatched deployment metadata and
cross-origin redirects. It does not require workspace credentials.

The Playwright-based enquiry smoke check runs the real form in Chromium. It
checks native Tab and Enter interaction, validation recovery, disabled-submit
behavior, announced network errors, retry behavior, successful receipts, and
preselected tutor profiles. Requests are intercepted so the check does not
create production enquiries:

```sh
SMOKE_PUBLISHED_URL=https://example.replit.app pnpm smoke:enquiry:published
```

For local or custom-domain checks, use `SMOKE_BASE_URL` instead of a published
URL. Per-request and overall smoke timeouts can be adjusted with
`SMOKE_TIMEOUT_MS` and `SMOKE_TOTAL_TIMEOUT_MS`.

For development, pre-publish, and post-publish smoke validation, including the
Replit workflow instructions and release sequence, see
[CI and pre-publish validation](ci-validation.md).

## Recommended verification sequence

For a normal change, run the affected package test suite first, then:

```sh
pnpm run typecheck
pnpm run build
```

Run the launch or enquiry smoke checks when the change affects routing, public
API responses, deployment configuration, or the enquiry journey.

Before publishing, use `pnpm run verify:ci` for the complete CI check. The
deployment build separately runs `pnpm run verify:deploy`, which excludes the
database-backed API lifecycle tests and runs only checks safe for the live
deployment database.
