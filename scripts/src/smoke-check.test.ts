import assert from "node:assert/strict";
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
  slug: "ada-lovelace",
  name: "Ada Lovelace",
  subject: "Mathematics",
  resources: [],
};

const resource = {
  id: 2,
  slug: "learning-mathematics",
  title: "Learning Mathematics",
  tutorSlug: tutor.slug,
  tutorName: tutor.name,
  type: "guide",
  readMinutes: 5,
  excerpt: "A short guide.",
  publishedAt: "2026-01-01T00:00:00.000Z",
};

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
    path === `/tutors/${tutor.slug}` ||
    path === `/resources/${resource.slug}`
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
  options: { published?: boolean; publishedUrl?: string } = {},
): Promise<{
  exitCode: number | null;
  output: string;
}> {
  const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const smokeFile = resolve(scriptsRoot, "src/smoke-check.ts");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      smokeFile,
      ...(options.published ? ["--published"] : []),
    ],
    {
      cwd: scriptsRoot,
      env: {
        ...process.env,
        ...(baseUrl ? { SMOKE_BASE_URL: baseUrl } : { SMOKE_BASE_URL: "" }),
        ...(options.publishedUrl
          ? { SMOKE_PUBLISHED_URL: options.publishedUrl }
          : { SMOKE_PUBLISHED_URL: "" }),
        SMOKE_TIMEOUT_MS: "2000",
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

test("published check rejects missing current deployment metadata", async () => {
  const result = await runSmokeCommand(undefined, { published: true });

  assert.notEqual(result.exitCode, 0, result.output);
  assert.match(
    result.output,
    /Published launch check requires SMOKE_PUBLISHED_URL from the current Publishing metadata/,
  );
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
      "/tutors/ada-lovelace",
      "/resources/learning-mathematics",
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
      "GET /tutors/ada-lovelace",
      "GET /resources/learning-mathematics",
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
