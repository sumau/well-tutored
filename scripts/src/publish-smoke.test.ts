import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublishedUrl } from "./publish-smoke.js";

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
