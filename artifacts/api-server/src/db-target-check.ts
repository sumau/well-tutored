import { pool } from "@workspace/db";

try {
  const result = await pool.query<{
    database_name: string;
    schema_name: string;
  }>(
    "SELECT current_database() AS database_name, current_schema() AS schema_name",
  );
  const identity = result.rows[0];

  if (!identity) {
    throw new Error("Database identity query returned no rows");
  }

  console.log(
    `[deploy-db-check] database=${identity.database_name} schema=${identity.schema_name}`,
  );
} finally {
  await pool.end();
}