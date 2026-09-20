import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const isIntegrationTest = process.env.NODE_ENV === "test";
const applicationDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (isIntegrationTest && !testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for integration tests; refusing to use DATABASE_URL.",
  );
}

if (
  isIntegrationTest &&
  applicationDatabaseUrl &&
  testDatabaseUrl === applicationDatabaseUrl
) {
  throw new Error(
    "TEST_DATABASE_URL must be different from DATABASE_URL; integration tests cannot use an application database.",
  );
}

const databaseUrl = isIntegrationTest ? testDatabaseUrl : applicationDatabaseUrl;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
