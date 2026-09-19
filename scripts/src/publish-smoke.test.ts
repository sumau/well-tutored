import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { resolvePublishedUrl } from "./publish-smoke.js";

const scriptsRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);

function runPublishedLifecycle(
  environment: NodeJS.ProcessEnv,
): Promise<{ exitCode: number | null; output: string }> {
  const child = spawn(
    "pnpm",
    ["--filter", "@workspace/scripts", "run", "smoke:published:lifecycle"],
    {
      cwd: resolve(scriptsRoot, ".."),
      env: {
        ...process.env,
        ...environment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return new Promise((resolveResult, reject) => {
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (exitCode) => resolveResult({ exitCode, output }));
  });
}

test("publish lifecycle prefers an explicit smoke URL", () => {
  assert.deepEqual(
    resolvePublishedUrl({
      SMOKE_PUBLISHED_URL: "https://explicit.example",
      REPLIT_PUBLISHED_URL: "https://publishing-output.example",
    }),
    {
      value: "https://explicit.example",
      source: "SMOKE_PUBLISHED_URL",
    },
  );
});

test("publish lifecycle copies the current Publishing output URL", () => {
  assert.deepEqual(
    resolvePublishedUrl({
      REPLIT_PUBLISHED_URL: "https://publishing-output.example",
    }),
    {
      value: "https://publishing-output.example",
      source: "REPLIT_PUBLISHED_URL",
    },
  );
});

test("publish lifecycle does not fall back to the configured smoke target", () => {
  assert.equal(
    resolvePublishedUrl({
      SMOKE_PRODUCTION_URL: "https://checked-in.example",
    }),
    undefined,
  );
});

test("publish lifecycle rejects malformed current Publishing metadata before requests", async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method ?? "GET"} ${request.url ?? "/"}`);
    response.writeHead(500);
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const result = await runPublishedLifecycle({
      SMOKE_BASE_URL: "",
      SMOKE_PUBLISHED_URL: "",
      REPLIT_PUBLISHED_URL: "not-a-url",
    });

    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      /REPLIT_PUBLISHED_URL must be an absolute HTTP\(S\) URL; received "not-a-url"\./,
    );
    assert.deepEqual(requests, []);
    assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
