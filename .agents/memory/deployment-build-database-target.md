---
name: Deployment build database target
description: This project's Replit deployment pre-build command receives the production PostgreSQL database.
---

For this project, the `.replit` deployment build runs with the production database connection. The read-only identity check reported `neondb` during a successful publish, while development reports `heliumdb`.

**Why:** The deployment build runs the API lifecycle tests after connecting to `neondb`, so those tests can mutate production data before the new release is promoted.

**How to apply:** Keep mutating integration tests out of the deployment build. Run them against an isolated test database in CI, and reserve the deployment gate for non-mutating checks.