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
    REPLIT_DEV_DOMAIN: "preview.example",
    TRUSTED_ORIGINS: "https://app.example, http://localhost:4200",
  };

  assert.deepEqual(
    [...getTrustedOrigins(environment)].sort(),
    ["http://localhost:4200", "https://app.example"],
  );
  assert.equal(isTrustedOrigin("https://app.example", environment), true);
  assert.equal(isTrustedOrigin("https://preview.example", environment), false);
});

test("derives development and production origins from their environment", () => {
  assert.equal(
    isTrustedOrigin("https://preview.example", {
      NODE_ENV: "development",
      REPLIT_DEV_DOMAIN: "preview.example",
    }),
    true,
  );
  assert.equal(
    isTrustedOrigin("https://app.example", {
      NODE_ENV: "production",
      REPLIT_DOMAINS: "app.example",
    }),
    true,
  );
  assert.equal(
    isTrustedOrigin("https://preview.example", {
      NODE_ENV: "production",
      REPLIT_DOMAINS: "app.example",
    }),
    false,
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