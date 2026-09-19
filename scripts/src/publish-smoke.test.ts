import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublishedUrl } from "./publish-smoke.js";

test("publish lifecycle prefers an explicit smoke URL", () => {
  assert.equal(
    resolvePublishedUrl({
      SMOKE_PUBLISHED_URL: "https://explicit.example",
      REPLIT_PUBLISHED_URL: "https://publishing-output.example",
    }),
    "https://explicit.example",
  );
});

test("publish lifecycle copies the current Publishing output URL", () => {
  assert.equal(
    resolvePublishedUrl({
      REPLIT_PUBLISHED_URL: "https://publishing-output.example",
    }),
    "https://publishing-output.example",
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
