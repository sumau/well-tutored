#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Post-merge schema setup targets the development database only. CI prepares its
# isolated TEST_DATABASE_URL separately through `pnpm run prepare:test-database`.
pnpm --filter @workspace/db run push-force
