---
name: PostgreSQL data snapshots
description: How to compare PostgreSQL application data before and after isolated integration tests.
---

Raw `pg_dump` output is not reliable for a before/after content fingerprint because dump ordering can vary between otherwise identical reads.

**Why:** A CI isolation check initially reported a false application-database mutation even though the test suite used a separate database; normalized per-table row summaries produced a stable unchanged result.

**How to apply:** For non-invasive checks that integration tests did not touch the application database, hash sorted per-table row counts and row-content digests while keeping the data itself out of command output.