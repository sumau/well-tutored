import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveWebClientRoot } from "./web-client";

test("serves nothing when nothing configured a root", () => {
  assert.equal(resolveWebClientRoot({ NODE_ENV: "development" }), undefined);
  assert.equal(
    resolveWebClientRoot({ NODE_ENV: "development", WEB_CLIENT_ROOT: "  " }),
    undefined,
  );
});

test("leaves the frontend to whatever else fronts it in production", () => {
  // Replit's router serves the build and the deployment runs with
  // NODE_ENV=production, so an unset root must not be a startup failure.
  assert.equal(resolveWebClientRoot({ NODE_ENV: "production" }), undefined);
  assert.equal(
    resolveWebClientRoot({ NODE_ENV: "production", REPLIT_DOMAINS: "app.example" }),
    undefined,
  );
});

test("resolves the configured root to an absolute path", () => {
  assert.equal(
    resolveWebClientRoot({
      NODE_ENV: "production",
      WEB_CLIENT_ROOT: "/srv/well-tutored/web",
    }),
    "/srv/well-tutored/web",
  );
  assert.equal(
    resolveWebClientRoot({ WEB_CLIENT_ROOT: " ./web " }),
    path.resolve("./web"),
  );
});
