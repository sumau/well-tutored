import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import { logger } from "./logger";

const INDEX_FILE = "index.html";
const ASSETS_DIRECTORY = "assets";

type Environment = Record<string, string | undefined>;

/**
 * Resolve the directory holding the built frontend, or undefined when this
 * process is not the one serving it.
 *
 * Replit's router fronted the API and the frontend build on a single domain, so
 * the API never served HTML. Off Replit there is no router, and the frontend has
 * to be served from this origin rather than a separate static host: Clerk's
 * session cookies are same-origin, `requireTrustedMutationOrigin` compares the
 * request origin against this deployment's own, and the Clerk Frontend API proxy
 * rewrites `Clerk-Proxy-Url` from the host the browser actually used.
 *
 * WEB_CLIENT_ROOT names the directory, and its absence is a legitimate state
 * rather than a misconfiguration: under Replit's router, and in development
 * behind the Vite dev server, something else serves the frontend and this
 * process must not. docker/Dockerfile sets it; nothing else does.
 */
export function resolveWebClientRoot(
  environment: Environment = process.env,
): string | undefined {
  const configured = environment["WEB_CLIENT_ROOT"]?.trim();
  if (!configured) return undefined;

  return path.resolve(configured);
}

/**
 * Serve the built frontend, if this process owns it. Mount after the /api
 * router and its 404 so no frontend route can shadow the API.
 */
export function mountWebClient(
  app: Express,
  environment: Environment = process.env,
): void {
  const root = resolveWebClientRoot(environment);
  if (!root) {
    // Expected on Replit and in development. Logged in production because for a
    // single-origin container deployment it means every page is about to 404
    // while /api/healthz keeps answering, which no health check would catch.
    if (environment["NODE_ENV"] === "production") {
      logger.warn(
        "WEB_CLIENT_ROOT is not set, so this server is not serving the " +
          "frontend build. Correct if something else fronts it, a " +
          "misconfiguration if this deployment is meant to serve both.",
      );
    }
    return;
  }

  const indexPath = path.join(root, INDEX_FILE);
  if (!existsSync(indexPath)) {
    throw new Error(
      `WEB_CLIENT_ROOT "${root}" does not contain ${INDEX_FILE}. ` +
        "Run the frontend build before starting the server.",
    );
  }

  // Vite fingerprints everything under assets/, so those can be cached
  // permanently. fallthrough:false keeps a missing asset a 404 instead of
  // letting the SPA fallback answer it with HTML and a 200 — a stale index.html
  // asking for a deleted bundle should fail visibly, not render half an app.
  app.use(
    `/${ASSETS_DIRECTORY}`,
    express.static(path.join(root, ASSETS_DIRECTORY), {
      index: false,
      immutable: true,
      maxAge: "1y",
      fallthrough: false,
    }),
  );

  // Unfingerprinted files sitting at the root of the build: favicon.svg,
  // logo.svg, robots.txt.
  app.use(express.static(root, { index: false }));

  // Everything left is a deep link into the client-side router.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    // index.html names the current fingerprinted bundles, so it must always be
    // revalidated; caching it is how a deployment serves the previous release's
    // asset URLs after those assets are gone.
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexPath, (err) => {
      if (err) next(err);
    });
  });

  logger.info({ root }, "Serving the built frontend");
}
