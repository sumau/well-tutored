---
name: Clean integration fixtures
description: Why database-backed lifecycle tests must seed their own baseline rows.
---

Database-backed integration tests must create every baseline row that their assertions depend on instead of relying on application seed data or a previously populated database.

**Why:** A dedicated schema-only test database exposed that the lifecycle suite expected a second tutor to exist before creating and editing its own records.

**How to apply:** When adding or isolating lifecycle coverage, provision required baseline fixtures in test setup and delete only that run's namespace during cleanup.