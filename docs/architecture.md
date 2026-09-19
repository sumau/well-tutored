# Well Tutored architecture

This project keeps the existing React, Express, Drizzle, Clerk, and generated
OpenAPI client stack. The application is organized around two user-facing
surfaces and a shared API/data layer.

## Public website

The React app serves the public experience:

- `/` — tutor discovery homepage
- `/tutors/:slug` — published tutor profile
- `/resources` — published resource library
- `/resources/:slug` — published resource detail
- `/enquire` — enquiry form

Public pages use the shared `Shell` for navigation, footer, policy dialogs, and
the public visual language. Public API handlers live in
`artifacts/api-server/src/routes/content.ts` and
`artifacts/api-server/src/routes/enquiries.ts`.

## Workspace

Workspace routes are protected by Clerk and the workspace account boundary:

- `/workspace` — dashboard
- `/workspace/profile` — tutor profile drafts and publishing
- `/workspace/resources/...` — resource drafts and publishing
- `/workspace/tutors` — owner-only tutor profile management
- `/workspace/accounts` — owner-only account approval and tutor assignment

`/workspace/articles/...` remains a compatibility alias and redirects to the
canonical resource URLs. Workspace accounts are stored in the
`workspace_accounts` table; the existing `studio_account_role` enum remains a
legacy database identifier to avoid an unnecessary second schema migration.

## API boundaries

Workspace code is split by responsibility:

- `auth/workspace-access.ts` — authenticated account lookup and role checks
- `services/workspace-account-service.ts` — Clerk-to-workspace account
  provisioning, tutor assignment initialization, slug allocation, and accent
  availability
- `domain/workspace-validation.ts` — publishability rules for resources and
  tutor profiles
- `presenters/resource-presenter.ts` — resource response mapping and joined
  resource lookup
- `presenters/tutor-presenter.ts` — tutor response mapping and draft overlay
- `routes/workspace.ts` — HTTP validation, route orchestration, and database
  mutations

The intended direction for future workspace changes is to keep route handlers
thin: authenticate, validate the request, call a domain/service function, and
present the response. Generated API clients and schemas remain generated
artifacts and should not be edited manually.

## Publishing rules

- A published tutor profile can have a private draft.
- Public routes read published tutor and resource state.
- Publishing validates the complete object before changing its status.
- Discarding a tutor profile draft restores the published profile.
- Archived tutors must be restored before editing.
- A tutor account can edit its own resources; an owner can manage all workspace
  records.