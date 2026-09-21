---
name: Deploy does not touch the database
description: The Deploy pipeline never applies the schema or runs mutating tests against the Deployment database.
---

The Deploy job builds and ships the container and then runs the launch smoke
against it. It opens no connection to the Deployment database, applies no
schema, and runs no mutating tests.

**Why:** This project previously ran its deployment build against the
production database, so API lifecycle tests could mutate production data before
a release was promoted. Schema changes were separately applied by a post-merge
`push --force` that nobody reviewed.

**How to apply:** Keep mutating integration tests in CI against an isolated
test database. Apply schema changes by a deliberate `push` from a checkout,
before merging anything that expects them — see
`docs/adr/0002-schema-by-deliberate-push.md`.
