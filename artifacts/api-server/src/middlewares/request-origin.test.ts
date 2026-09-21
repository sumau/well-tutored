import assert from "node:assert/strict";
import test from "node:test";
import {
  getTrustedOrigins,
  isTrustedOrigin,
  normalizeOrigin,
  requireTrustedMutationOrigin,
  RequestOriginError,
} from "./request-origin";

test("normalizes only origin-shaped values", () => {
  assert.equal(normalizeOrigin("HTTPS://Example.test/"), "https://example.test");
  assert.equal(normalizeOrigin("example.test"), "https://example.test");
  assert.equal(normalizeOrigin("https://example.test/path"), undefined);
  assert.equal(normalizeOrigin("https://user:password@example.test"), undefined);
  assert.equal(normalizeOrigin("null"), undefined);
});

test("uses configured origins instead of widening to defaults", () => {
  const environment = {
    NODE_ENV: "development",
    TRUSTED_ORIGINS: "https://app.example, http://localhost:4200",
  };

  assert.deepEqual(
    [...getTrustedOrigins(environment)].sort(),
    ["http://localhost:4200", "https://app.example"],
  );
  assert.equal(isTrustedOrigin("https://app.example", environment), true);
  assert.equal(isTrustedOrigin("http://localhost:5173", environment), false);
});

test("falls back to the local defaults in development and to nothing in production", () => {
  assert.deepEqual(
    [...getTrustedOrigins({ NODE_ENV: "development", PORT: "8080" })].sort(),
    [
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8080",
      "http://localhost:5173",
      "http://localhost:8080",
    ],
  );
  // A production Deployment names its origin in fly.toml or trusts nothing.
  // There is no environment left to infer one from, and an empty set rejects
  // every credentialed request rather than guessing.
  assert.deepEqual([...getTrustedOrigins({ NODE_ENV: "production" })], []);
  assert.equal(
    isTrustedOrigin("https://app.example", { NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    isTrustedOrigin("https://app.example", {
      NODE_ENV: "production",
      TRUSTED_ORIGINS: "https://app.example",
    }),
    true,
  );
});

function runMutationGuard(headers: Record<string, string>, method = "POST") {
  let nextError: unknown;
  requireTrustedMutationOrigin(
    { method, headers } as never,
    {} as never,
    (error?: unknown) => {
      nextError = error;
    },
  );
  return nextError;
}

test("rejects cross-site workspace mutations and allows requests without browser headers", () => {
  const previousOrigins = process.env.TRUSTED_ORIGINS;
  process.env.TRUSTED_ORIGINS = "https://app.example";
  try {
    assert(runMutationGuard({ origin: "https://evil.example" }) instanceof RequestOriginError);
    assert(runMutationGuard({ "sec-fetch-site": "cross-site" }) instanceof RequestOriginError);
    assert.equal(runMutationGuard({}), undefined);
    assert.equal(runMutationGuard({ origin: "https://app.example" }, "GET"), undefined);
  } finally {
    if (previousOrigins === undefined) delete process.env.TRUSTED_ORIGINS;
    else process.env.TRUSTED_ORIGINS = previousOrigins;
  }
});