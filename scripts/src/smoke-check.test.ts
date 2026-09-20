import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { test } from "node:test";
import {
  SMOKE_TOTAL_TIMEOUT_MAX_MS,
  SMOKE_TOTAL_TIMEOUT_MIN_MS,
  SMOKE_TIMEOUT_MAX_MS,
  SMOKE_TIMEOUT_MIN_MS,
} from "./smoke-check.js";

type FailureCase = {
  name: string;
  expectedMessage: string;
  respond: (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
  ) => boolean;
};

type Fixture = {
  close: () => Promise<void>;
  requests: string[];
  url: string;
};

const tutor = {
  id: 1,
  slug: "ada lovelace",
  name: "Ada Lovelace",
  subject: "Mathematics",
  resources: [],
};

const resource = {
  id: 2,
  slug: "learning & mathematics",
  title: "Learning Mathematics",
  tutorSlug: tutor.slug,
  tutorName: tutor.name,
  type: "guide",
  readMinutes: 5,
  excerpt: "A short guide.",
  publishedAt: "2026-01-01T00:00:00.000Z",
};

const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactConfigPath = resolve(
  scriptsRoot,
  "../artifacts/well-tutored/.replit-artifact/artifact.toml",
);

function writeJson(
  response: ServerResponse<IncomingMessage>,
  body: unknown,
  status = 200,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function writePage(
  response: ServerResponse<IncomingMessage>,
  body = "<!doctype html><title>Well Tutored</title>",
  contentType = "text/html",
) {
  response.writeHead(200, { "content-type": contentType });
  response.end(body);
}

function writeHealthyResponse(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
) {
  const path = request.url ?? "/";

  if (path === "/api/healthz") {
    writeJson(response, { status: "ok" });
    return;
  }
  if (path === "/api/__clerk/v1/environment") {
    writeJson(response, {
      auth_config: { object: "auth_config" },
      display_config: { object: "display_config" },
    });
    return;
  }
  if (path === "/api/tutors") {
    writeJson(response, [{ ...tutor, resources: [resource] }]);
    return;
  }
  if (path === "/api/resources") {
    writeJson(response, [resource]);
    return;
  }
  if (
    path === "/" ||
    path === "/resources" ||
    path === "/enquire" ||
    path === `/tutors/${encodeURIComponent(tutor.slug)}` ||
    path === `/resources/${encodeURIComponent(resource.slug)}`
  ) {
    writePage(response);
    return;
  }
  if (path === "/api/enquiries" && request.method === "POST") {
    writeJson(response, { error: "Invalid enquiry." }, 400);
    return;
  }

  writeJson(response, { error: "Not found." }, 404);
}

async function startFixture(testCase: FailureCase): Promise<Fixture> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method ?? "GET"} ${request.url ?? "/"}`);
    if (testCase.respond(request, response)) {
      return;
    }
    writeHealthyResponse(request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

async function startRedirectFixture(): Promise<{
  close: () => Promise<void>;
  sourceUrl: string;
  destinationUrl: string;
}> {
  const destination = await startFixture({
    name: "redirect destination",
    expectedMessage: "",
    respond: () => false,
  });
  const sourceServer = createServer((request, response) => {
    const destinationUrl = new URL(request.url ?? "/", destination.url);
    response.writeHead(302, { location: destinationUrl.toString() });
    response.end();
  });
  sourceServer.listen(0, "127.0.0.1");
  await once(sourceServer, "listening");
  const address = sourceServer.address();
  assert.ok(address && typeof address === "object");

  return {
    sourceUrl: `http://127.0.0.1:${address.port}`,
    destinationUrl: destination.url,
    close: async () => {
      sourceServer.close();
      await once(sourceServer, "close");
      await destination.close();
    },
  };
}

function pathResponse(
  path: string,
  callback: (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
  ) => void,
): FailureCase["respond"] {
  return (request, response) => {
    if (request.url !== path) {
      return false;
    }
    callback(request, response);
    return true;
  };
}

const failureCases: FailureCase[] = [
  {
    name: "unexpected status codes",
    expectedMessage: "/api/healthz: expected HTTP 200, received 503.",
    respond: pathResponse("/api/healthz", (_request, response) => {
      writeJson(response, { error: "temporarily unavailable" }, 503);
    }),
  },
  {
    name: "malformed health payloads",
    expectedMessage: '/api/healthz: expected {"status":"ok"}.',
    respond: pathResponse("/api/healthz", (_request, response) => {
      writeJson(response, { status: "degraded" });
    }),
  },
  {
    name: "invalid JSON responses",
    expectedMessage: "/api/healthz: response was not valid JSON.",
    respond: pathResponse("/api/healthz", (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":');
    }),
  },
  {
    name: "responses that exceed the smoke timeout",
    expectedMessage: "/api/healthz: request failed: timed out after 2000ms",
    respond: pathResponse("/api/healthz", (_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
      }, 2_100);
    }),
  },
  {
    name: "responses that stall after sending headers",
    expectedMessage: "/api/healthz: request failed: timed out after 2000ms",
    respond: pathResponse("/api/healthz", (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"status":');
    }),
  },
  {
    name: "connections that are dropped by the loopback service",
    expectedMessage: "/api/healthz: request failed:",
    respond: pathResponse("/api/healthz", (_request, response) => {
      response.destroy();
    }),
  },
  {
    name: "malformed Clerk payloads",
    expectedMessage:
      "/api/__clerk/v1/environment: unexpected auth_config object.",
    respond: pathResponse(
      "/api/__clerk/v1/environment",
      (_request, response) => {
        writeJson(response, {
          auth_config: { object: "unexpected" },
          display_config: { object: "display_config" },
        });
      },
    ),
  },
  {
    name: "malformed tutor payloads",
    expectedMessage: '/api/tutors[0]: expected an array "resources".',
    respond: pathResponse("/api/tutors", (_request, response) => {
      writeJson(response, [{ ...tutor, resources: "not-an-array" }]);
    }),
  },
  {
    name: "malformed resource payloads",
    expectedMessage: '/api/resources[0]: expected an integer "id".',
    respond: pathResponse("/api/resources", (_request, response) => {
      writeJson(response, [{ ...resource, id: "not-an-integer" }]);
    }),
  },
  {
    name: "malformed HTML payloads",
    expectedMessage: '/: expected HTML content, received "application/json".',
    respond: pathResponse("/", (_request, response) => {
      writePage(response, JSON.stringify({ html: false }), "application/json");
    }),
  },
  {
    name: "malformed enquiry-validation payloads",
    expectedMessage:
      'POST /api/enquiries (invalid payload): expected a non-empty "error" string.',
    respond: pathResponse("/api/enquiries", (request, response) => {
      if (request.method !== "POST") {
        return;
      }
      writeJson(response, {}, 400);
    }),
  },
];

function runSmokeCommand(
  baseUrl: string | undefined,
  options: {
    development?: boolean;
    published?: boolean;
    publishedUrl?: string;
    publishedUrlSource?: "SMOKE_PUBLISHED_URL" | "REPLIT_PUBLISHED_URL";
    timeoutMs?: string;
    totalTimeoutMs?: string;
  } = {},
): Promise<{
  exitCode: number | null;
  output: string;
}> {
  const smokeFile = resolve(scriptsRoot, "src/smoke-check.ts");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      smokeFile,
      ...(options.published ? ["--published"] : []),
      ...(options.development ? ["--dev"] : []),
    ],
    {
      cwd: scriptsRoot,
      env: {
        ...process.env,
        ...(baseUrl ? { SMOKE_BASE_URL: baseUrl } : { SMOKE_BASE_URL: "" }),
        SMOKE_PUBLISHED_URL:
          options.publishedUrl &&
          (options.publishedUrlSource ?? "SMOKE_PUBLISHED_URL") ===
            "SMOKE_PUBLISHED_URL"
            ? options.publishedUrl
            : "",
        REPLIT_PUBLISHED_URL:
          options.publishedUrl &&
          options.publishedUrlSource === "REPLIT_PUBLISHED_URL"
            ? options.publishedUrl
            : "",
        SMOKE_TIMEOUT_MS: options.timeoutMs ?? "2000",
        SMOKE_TOTAL_TIMEOUT_MS: options.totalTimeoutMs ?? "60000",
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

test("malformed SMOKE_PUBLISHED_URL fails before contacting loopback or production", async () => {
  const fixture = await startFixture({
    name: "unused published URL validation fixture",
    expectedMessage: "",
    respond: () => false,
  });

  try {
    const result = await runSmokeCommand(undefined, {
      published: true,
      publishedUrl: "not-a-url",
    });

    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      /SMOKE_PUBLISHED_URL must be an absolute HTTP\(S\) URL; received "not-a-url"\./,
    );
    assert.deepEqual(fixture.requests, []);
    assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
  } finally {
    await fixture.close();
  }
});

test("malformed REPLIT_PUBLISHED_URL fails before contacting loopback or production", async () => {
  const fixture = await startFixture({
    name: "unused Publishing output URL validation fixture",
    expectedMessage: "",
    respond: () => false,
  });

  try {
    const result = await runSmokeCommand(undefined, {
      published: true,
      publishedUrl: "not-a-url",
      publishedUrlSource: "REPLIT_PUBLISHED_URL",
    });

    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      /REPLIT_PUBLISHED_URL must be an absolute HTTP\(S\) URL; received "not-a-url"\./,
    );
    assert.deepEqual(fixture.requests, []);
    assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
  } finally {
    await fixture.close();
  }
});

test("malformed SMOKE_PRODUCTION_URL fails before contacting loopback or production", async () => {
  const fixture = await startFixture({
    name: "unused production URL validation fixture",
    expectedMessage: "",
    respond: () => false,
  });
  const originalArtifactConfig = readFileSync(artifactConfigPath, "utf8");
  const malformedArtifactConfig = originalArtifactConfig.replace(
    /SMOKE_PRODUCTION_URL\s*=\s*"[^"\r\n]*"/,
    'SMOKE_PRODUCTION_URL = "not-a-url"',
  );
  assert.notEqual(
    malformedArtifactConfig,
    originalArtifactConfig,
    "expected the artifact production URL setting to be present",
  );
  writeFileSync(artifactConfigPath, malformedArtifactConfig);

  try {
    const result = await runSmokeCommand(undefined, {
      published: true,
      publishedUrl: "https://welltutored.replit.app",
    });

    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      /SMOKE_PRODUCTION_URL must be an absolute HTTP\(S\) URL; received "not-a-url"\./,
    );
    assert.deepEqual(fixture.requests, []);
    assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
  } finally {
    writeFileSync(artifactConfigPath, originalArtifactConfig);
    await fixture.close();
  }
});

test("malformed SMOKE_BASE_URL fails before contacting loopback or production", async () => {
  const fixture = await startFixture({
    name: "unused URL validation fixture",
    expectedMessage: "",
    respond: () => false,
  });

  try {
    const result = await runSmokeCommand("not-a-url");

    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      /SMOKE_BASE_URL must be an absolute HTTP\(S\) URL; received "not-a-url"\./,
    );
    assert.deepEqual(fixture.requests, []);
    assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
  } finally {
    await fixture.close();
  }
});

for (const timeoutMs of [
  "not-a-number",
  "0",
  "-1",
  "100.5",
  String(SMOKE_TIMEOUT_MAX_MS + 1),
  "Infinity",
  "NaN",
]) {
  test(
    `invalid SMOKE_TIMEOUT_MS="${timeoutMs}" fails before making requests ` +
      `(supported range: ${SMOKE_TIMEOUT_MIN_MS}-${SMOKE_TIMEOUT_MAX_MS}ms integers)`,
    async () => {
      const fixture = await startFixture({
        name: `unused timeout validation fixture (${timeoutMs})`,
        expectedMessage: "",
        respond: () => false,
      });

      try {
        const result = await runSmokeCommand(fixture.url, { timeoutMs });

        assert.notEqual(result.exitCode, 0, result.output);
        assert.match(
          result.output,
          new RegExp(
            `SMOKE_TIMEOUT_MS must be an integer number of milliseconds between ` +
              `${SMOKE_TIMEOUT_MIN_MS} and ${SMOKE_TIMEOUT_MAX_MS}; received "${timeoutMs.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
              )}"\\.`,
          ),
        );
        assert.deepEqual(fixture.requests, []);
        assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
      } finally {
        await fixture.close();
      }
    },
  );
}

for (const totalTimeoutMs of [
  "not-a-number",
  String(SMOKE_TOTAL_TIMEOUT_MIN_MS - 1),
  "1000.5",
  String(SMOKE_TOTAL_TIMEOUT_MAX_MS + 1),
  "Infinity",
  "NaN",
]) {
  test(
    `invalid SMOKE_TOTAL_TIMEOUT_MS="${totalTimeoutMs}" fails before making requests ` +
      `(supported range: ${SMOKE_TOTAL_TIMEOUT_MIN_MS}-${SMOKE_TOTAL_TIMEOUT_MAX_MS}ms integers)`,
    async () => {
      const fixture = await startFixture({
        name: `unused total timeout validation fixture (${totalTimeoutMs})`,
        expectedMessage: "",
        respond: () => false,
      });

      try {
        const result = await runSmokeCommand(fixture.url, { totalTimeoutMs });

        assert.notEqual(result.exitCode, 0, result.output);
        assert.match(
          result.output,
          new RegExp(
            `SMOKE_TOTAL_TIMEOUT_MS must be an integer number of milliseconds between ` +
              `${SMOKE_TOTAL_TIMEOUT_MIN_MS} and ${SMOKE_TOTAL_TIMEOUT_MAX_MS}; received "${totalTimeoutMs.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
              )}"\\.`,
          ),
        );
        assert.deepEqual(fixture.requests, []);
        assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
      } finally {
        await fixture.close();
      }
    },
  );
}

test("published check rejects missing current deployment metadata", async () => {
  const result = await runSmokeCommand(undefined, { published: true });

  assert.notEqual(result.exitCode, 0, result.output);
  assert.match(
    result.output,
    /Published launch check requires SMOKE_PUBLISHED_URL or REPLIT_PUBLISHED_URL from the current Publishing metadata/,
  );
});

test("development check requires an explicit development target", async () => {
  const result = await runSmokeCommand(undefined, { development: true });

  assert.notEqual(result.exitCode, 0, result.output);
  assert.match(
    result.output,
    /Development launch check requires SMOKE_BASE_URL so it cannot accidentally target production/,
  );
});

test("development check skips the production-only Clerk proxy assertion", async () => {
  const fixture = await startFixture({
    name: "healthy development run",
    expectedMessage: "",
    respond: () => false,
  });

  try {
    const result = await runSmokeCommand(fixture.url, { development: true });

    assert.equal(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      /- \/api\/__clerk\/v1\/environment \(Clerk proxy is production-only\)/,
    );
    assert.equal(
      fixture.requests.includes("GET /api/__clerk/v1/environment"),
      false,
    );
  } finally {
    await fixture.close();
  }
});

test("published check rejects a deployment domain that drifted from the artifact target", async () => {
  const result = await runSmokeCommand(undefined, {
    published: true,
    publishedUrl: "https://custom.example",
  });

  assert.notEqual(result.exitCode, 0, result.output);
  assert.match(
    result.output,
    /does not match the Well Tutored artifact smoke target/,
  );
  assert.match(
    result.output,
    /Update SMOKE_PRODUCTION_URL in artifacts\/well-tutored\/\.replit-artifact\/artifact\.toml/,
  );
});

test("SMOKE_BASE_URL remains an explicit override for published checks", async () => {
  const fixture = await startFixture({
    name: "healthy override",
    expectedMessage: "",
    respond: () => false,
  });

  try {
    const result = await runSmokeCommand(fixture.url, { published: true });
    assert.equal(result.exitCode, 0, result.output);
    assert.match(result.output, /Launch smoke check passed/);
  } finally {
    await fixture.close();
  }
});

test("published target checks reject responses redirected to a different origin", async () => {
  const fixture = await startRedirectFixture();

  try {
    const result = await runSmokeCommand(fixture.sourceUrl, {
      published: true,
    });
    const escapedSourceUrl = fixture.sourceUrl.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const escapedDestinationUrl = fixture.destinationUrl.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      new RegExp(
        `/api/healthz: response redirected from configured origin "${escapedSourceUrl}" ` +
          `to final origin "${escapedDestinationUrl}".`,
      ),
    );
  } finally {
    await fixture.close();
  }
});

test(
  `SMOKE_TIMEOUT_MS accepts the supported boundaries ` +
    `(${SMOKE_TIMEOUT_MIN_MS}-${SMOKE_TIMEOUT_MAX_MS}ms)`,
  async () => {
    for (const timeoutMs of [
      SMOKE_TIMEOUT_MIN_MS,
      SMOKE_TIMEOUT_MAX_MS,
    ]) {
      const fixture = await startFixture({
        name: `timeout boundary fixture (${timeoutMs})`,
        expectedMessage: "",
        respond: () => false,
      });

      try {
        const result = await runSmokeCommand(fixture.url, {
          timeoutMs: String(timeoutMs),
        });
        assert.equal(result.exitCode, 0, result.output);
      } finally {
        await fixture.close();
      }
    }
  },
);

test("overall smoke deadline stops sequential slow requests", async () => {
  const fixture = await startFixture({
    name: "sequential slow requests",
    expectedMessage:
      "/api/__clerk/v1/environment: overall smoke check timed out after 1000ms.",
    respond: (request, response) => {
      const path = request.url ?? "/";
      if (
        path !== "/api/healthz" &&
        path !== "/api/__clerk/v1/environment"
      ) {
        return false;
      }

      response.on("error", () => {});
      setTimeout(() => {
        if (path === "/api/healthz") {
          writeJson(response, { status: "ok" });
        } else {
          writeJson(response, {
            auth_config: { object: "auth_config" },
            display_config: { object: "display_config" },
          });
        }
      }, 550);
      return true;
    },
  });

  try {
    const result = await runSmokeCommand(fixture.url, {
      totalTimeoutMs: "1000",
    });

    assert.notEqual(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      /\/api\/__clerk\/v1\/environment: overall smoke check timed out after 1000ms\./,
    );
    assert.match(result.output, /SMOKE_TOTAL_TIMEOUT_MS/);
    assert.deepEqual(fixture.requests, [
      "GET /api/healthz",
      "GET /api/__clerk/v1/environment",
    ]);
  } finally {
    await fixture.close();
  }
});

test("healthy launch checks pass entirely against the loopback fixture", async () => {
  const fixture = await startFixture({
    name: "healthy offline run",
    expectedMessage: "",
    respond: () => false,
  });

  try {
    const result = await runSmokeCommand(fixture.url);
    const expectedChecks = [
      "/api/healthz",
      "/api/__clerk/v1/environment",
      "/api/tutors",
      "/api/resources",
      "/",
      "/resources",
      "/enquire",
      "/tutors/ada%20lovelace",
      "/resources/learning%20%26%20mathematics",
      "POST /api/enquiries (invalid payload)",
      "/api/healthz after invalid enquiry",
    ];
    const reportedChecks = [...result.output.matchAll(/^\s+✓ (.+)$/gm)].map(
      ([, check]) => check,
    );

    assert.equal(result.exitCode, 0, result.output);
    assert.match(
      result.output,
      new RegExp(
        `Launch smoke check passed for ${fixture.url.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}`,
      ),
    );
    assert.deepEqual(reportedChecks, expectedChecks, result.output);
    assert.deepEqual(fixture.requests, [
      "GET /api/healthz",
      "GET /api/__clerk/v1/environment",
      "GET /api/tutors",
      "GET /api/resources",
      "GET /",
      "GET /resources",
      "GET /enquire",
      "GET /tutors/ada%20lovelace",
      "GET /resources/learning%20%26%20mathematics",
      "POST /api/enquiries",
      "GET /api/healthz",
    ]);
    assert.doesNotMatch(result.output, /welltutored\.replit\.app/);
  } finally {
    await fixture.close();
  }
});

for (const testCase of failureCases) {
  test(`fixture rejects ${testCase.name}`, async () => {
    const fixture = await startFixture(testCase);
    try {
      const result = await runSmokeCommand(fixture.url);
      assert.notEqual(result.exitCode, 0, result.output);
      assert.match(
        result.output,
        new RegExp(
          testCase.expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      );
    } finally {
      await fixture.close();
    }
  });
}
