# Well Tutored

Well Tutored helps families discover women tutors, read tutor-written resources, and send named-tutor enquiries.

## Run & Operate

- `PORT=8080 pnpm --filter @workspace/api-server run dev` — run the API server
  directly outside the managed artifact workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run prepare:test-database` — validate `TEST_DATABASE_URL` and apply the
  current schema to the dedicated integration-test database
- Required env: `DATABASE_URL` for PostgreSQL access; `VITE_CLERK_PUBLISHABLE_KEY` for the Well Tutored frontend; and `CLERK_PUBLISHABLE_KEY` for the API's Clerk middleware
- Integration tests require a separate `TEST_DATABASE_URL`. The integration test script sets `NODE_ENV=test`, so the database package uses `TEST_DATABASE_URL` only for that process and rejects a test URL identical to `DATABASE_URL`. `pnpm run verify:ci` provisions a temporary local PostgreSQL connection when no dedicated URL is supplied, or uses the supplied dedicated URL, then applies the current schema before running the API suite.
- The committed `Project` workflow runs CI before `dev-smoke`, so development smoke checks do not overlap with mutable integration-test work.
- Production-only API env: `CLERK_SECRET_KEY` enables the Clerk Frontend API proxy used by the production deployment. It is not required for development previews.

## Deploying

Replit publishes this repository: its router fronts both artifacts on one
domain, and `pnpm run verify:deploy` is the build gate.

The same app also deploys as a single container to any container host, where the
API serves the frontend build itself because there is no router to do it.
`docker/Dockerfile` and `fly.toml` cover that; see
[docs/deploy.md](docs/deploy.md). The trap worth knowing either way: off Replit
`TRUSTED_ORIGINS` must name the public origin explicitly, because the
`REPLIT_DOMAINS` fallback is gone and an empty trusted-origin set rejects every
credentialed request.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/well-tutored/src` — public directory, tutor/resource pages, enquiry flow, auth screens, and private workspace
- `artifacts/api-server/src` — Express routes, Clerk middleware, seed/bootstrap behavior, and server startup
- `lib/db/src/schema` — Drizzle/PostgreSQL schema
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/api-client-react` and `lib/api-zod` — generated frontend hooks and runtime schemas
- `artifacts/well-tutored/src/index.css` — editorial visual system and theme tokens

## Architecture decisions

- The public site remains accessible without an account; Clerk gates only the private workspace.
- `clerkMiddleware` is mounted under `/api` rather than globally: Clerk answers
  `text/html` requests with a handshake redirect, which would intercept every
  page load in a deployment where the API also serves the frontend build.
- Browser API requests use Clerk's same-origin session cookies; bearer-token wiring is reserved for mobile clients.
- Public tutor/resource content is served through the API and seeded for a useful first preview.
- OpenAPI generates both React Query hooks and Zod schemas to keep client/server contracts aligned.

## Product

The public experience presents women tutors educated at Russell Group universities, their expertise and availability, and a library of tutor-written learning resources. Visitors can open a tutor profile and submit a named-tutor enquiry. Approved workspace users can manage tutor profiles, resources, and workspace accounts.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- The managed workflows provide artifact `PORT` and `BASE_PATH`; the Vite configs also include local-build defaults.
- Development Clerk keys are expected in preview; the production app receives its own managed environment.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
