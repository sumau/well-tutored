import { spawn } from "node:child_process";
import { requireTestDatabaseUrl } from "./test-database.js";

function runSchemaPush(testDatabaseUrl: string): Promise<number> {
  const child = spawn(
    "pnpm",
    ["--filter", "@workspace/db", "run", "push-force"],
    {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
      },
      stdio: "inherit",
    },
  );

  return new Promise((resolve) => {
    child.once("error", (error) => {
      console.error(`Test database unavailable: ${error.message}`);
      resolve(1);
    });
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(
          `Test database unavailable: schema preparation stopped by ${signal}.`,
        );
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  let testDatabaseUrl: string;
  try {
    testDatabaseUrl = requireTestDatabaseUrl();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  console.log("Preparing the isolated integration-test database schema...");
  const exitCode = await runSchemaPush(testDatabaseUrl);
  if (exitCode !== 0) {
    console.error(
      "Test database unavailable: could not apply the current schema. " +
        "Check that TEST_DATABASE_URL points to a reachable dedicated PostgreSQL database.",
    );
    process.exitCode = exitCode;
    return;
  }

  console.log("Integration-test database schema is ready.");
}

void main();