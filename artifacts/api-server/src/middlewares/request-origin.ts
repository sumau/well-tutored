import type { IncomingHttpHeaders } from "node:http";
import type { Request, RequestHandler } from "express";

type Environment = Record<string, string | undefined>;

const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function valuesFromEnvironment(environment: Environment, key: string) {
  return (environment[key] ?? "")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Normalise an origin without accepting paths, credentials, or opaque origins.
 * A bare domain is read as HTTPS. Nothing this project configures is written
 * that way any more — the leniency is kept because a hostname pasted without a
 * scheme is a likely mistake and rejecting it silently trusts nothing.
 */
export function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value || value.trim() === "" || value.trim().toLowerCase() === "null") {
    return undefined;
  }

  const candidate = value.includes("://") ? value.trim() : `https://${value.trim()}`;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin.toLowerCase();
  } catch {
    return undefined;
  }
}

function configuredValues(environment: Environment) {
  const explicit = [
    ...valuesFromEnvironment(environment, "TRUSTED_ORIGINS"),
    ...valuesFromEnvironment(environment, "CORS_ORIGINS"),
  ];
  if (explicit.length > 0) return explicit;

  // Production names its origin explicitly or trusts nothing. Development gets
  // the local defaults, because there is no committed origin to read there.
  if (environment.NODE_ENV === "production") return [];

  const localPort = environment.PORT
    ? [`http://localhost:${environment.PORT}`, `http://127.0.0.1:${environment.PORT}`]
    : [];
  return [...LOCAL_DEVELOPMENT_ORIGINS, ...localPort];
}

/**
 * Return the exact origins that may receive credentialed API responses.
 * TRUSTED_ORIGINS (or the CORS_ORIGINS alias) replaces the localhost
 * development defaults rather than adding to them, so a Deployment trusts what
 * fly.toml names and nothing else.
 */
export function getTrustedOrigins(environment: Environment = process.env): Set<string> {
  return new Set(
    configuredValues(environment)
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
}

export function isTrustedOrigin(
  origin: string | undefined,
  environment: Environment = process.env,
): boolean {
  const normalized = normalizeOrigin(origin);
  return normalized !== undefined && getTrustedOrigins(environment).has(normalized);
}

function headerValue(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function requestOrigin(req: Request) {
  return headerValue(req.headers, "origin");
}

export class RequestOriginError extends Error {
  readonly statusCode = 403;
  readonly code = "origin_not_allowed";

  constructor(message = "Request origin is not allowed.") {
    super(message);
    this.name = "RequestOriginError";
  }
}

export const requireTrustedMutationOrigin: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = requestOrigin(req);
  const referer = headerValue(req.headers, "referer");
  const fetchSite = headerValue(req.headers, "sec-fetch-site")?.toLowerCase();

  if (fetchSite === "cross-site") {
    next(new RequestOriginError());
    return;
  }

  if (origin && !isTrustedOrigin(origin)) {
    next(new RequestOriginError());
    return;
  }

  let refererOrigin: string | undefined;
  if (referer) {
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      next(new RequestOriginError());
      return;
    }
    if (!isTrustedOrigin(refererOrigin)) {
      next(new RequestOriginError());
      return;
    }
  }

  if (
    origin &&
    refererOrigin &&
    normalizeOrigin(origin) !== normalizeOrigin(refererOrigin)
  ) {
    next(new RequestOriginError());
    return;
  }

  next();
};