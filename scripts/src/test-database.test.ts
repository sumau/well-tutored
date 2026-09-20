import assert from "node:assert/strict";
import test from "node:test";
import { requireTestDatabaseUrl } from "./test-database.js";

test("requires a dedicated test database URL", () => {
  assert.throws(
    () => requireTestDatabaseUrl({ DATABASE_URL: "postgres://application" }),
    {
      message:
        "Test database unavailable: set TEST_DATABASE_URL to a dedicated PostgreSQL connection before running database-backed integration tests.",
    },
  );
});

test("rejects using the application database for integration tests", () => {
  assert.throws(
    () =>
      requireTestDatabaseUrl({
        DATABASE_URL: "postgres://application",
        TEST_DATABASE_URL: "postgres://application",
      }),
    {
      message:
        "Test database unsafe: TEST_DATABASE_URL must be different from DATABASE_URL; integration tests cannot use an application database.",
    },
  );
});

test("accepts a distinct dedicated test database URL", () => {
  assert.equal(
    requireTestDatabaseUrl({
      DATABASE_URL: "postgres://application",
      TEST_DATABASE_URL: "postgres://integration-test",
    }),
    "postgres://integration-test",
  );
});