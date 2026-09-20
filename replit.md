# Well Tutored

Well Tutored helps families discover women tutors, read tutor-written resources, and send named-tutor enquiries.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` for PostgreSQL access; `VITE_CLERK_PUBLISHABLE_KEY` for the Well Tutored frontend; and `CLERK_PUBLISHABLE_KEY` for the API's Clerk middleware
- Production-only API env: `CLERK_SECRET_KEY` enables the Clerk Frontend API proxy used by the production deployment. It is not required for development previews.

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
