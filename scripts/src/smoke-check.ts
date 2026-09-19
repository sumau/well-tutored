import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT_DEPLOYMENT_CONFIG_URL = new URL(
  "../../artifacts/well-tutored/.replit-artifact/artifact.toml",
  import.meta.url,
);
const PRODUCTION_URL_CONFIG_KEY = "SMOKE_PRODUCTION_URL";
const PUBLISHED_URL_ENV_KEY = "SMOKE_PUBLISHED_URL";
const PUBLISHING_OUTPUT_URL_ENV_KEY = "REPLIT_PUBLISHED_URL";
export const SMOKE_TIMEOUT_MIN_MS = 100;
export const SMOKE_TIMEOUT_MAX_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const SMOKE_TIMEOUT_FORMAT = /^\d+$/;
const PUBLISHED_CHECK_FLAG = "--published";

type JsonRecord = Record<string, unknown>;

type ResponseData = {
  response: Response;
  body: string;
  contentType: string;
};

class SmokeCheckError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new SmokeCheckError(`${label}: expected a JSON object.`);
  }
  return value;
}

function requireNonEmptyString(
  value: unknown,
  field: string,
  label: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SmokeCheckError(
      `${label}: expected a non-empty "${field}" string.`,
    );
  }
  return value;
}

function requireInteger(value: unknown, field: string, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new SmokeCheckError(`${label}: expected an integer "${field}".`);
  }
  return value;
}

function requireArray(value: unknown, field: string, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SmokeCheckError(`${label}: expected an array "${field}".`);
  }
  return value;
}

function parseJson(data: ResponseData, label: string): unknown {
  if (!data.contentType.toLowerCase().includes("application/json")) {
    throw new SmokeCheckError(
      `${label}: expected JSON content, received "${data.contentType || "none"}".`,
    );
  }

  try {
    return JSON.parse(data.body) as unknown;
  } catch {
    throw new SmokeCheckError(`${label}: response was not valid JSON.`);
  }
}

function expectStatus(data: ResponseData, expected: number, label: string) {
  if (data.response.status !== expected) {
    const bodyPreview = data.body.replace(/\s+/g, " ").slice(0, 180);
    throw new SmokeCheckError(
      `${label}: expected HTTP ${expected}, received ${data.response.status}.` +
        (bodyPreview ? ` Body: ${bodyPreview}` : ""),
    );
  }
}

function expectResource(value: unknown, label: string): JsonRecord {
  const resource = requireRecord(value, label);
  requireInteger(resource.id, "id", label);
  requireNonEmptyString(resource.slug, "slug", label);
  requireNonEmptyString(resource.title, "title", label);
  requireNonEmptyString(resource.tutorSlug, "tutorSlug", label);
  requireNonEmptyString(resource.tutorName, "tutorName", label);
  requireNonEmptyString(resource.type, "type", label);
  requireInteger(resource.readMinutes, "readMinutes", label);
  requireNonEmptyString(resource.excerpt, "excerpt", label);
  requireNonEmptyString(resource.publishedAt, "publishedAt", label);
  if (Number.isNaN(Date.parse(resource.publishedAt as string))) {
    throw new SmokeCheckError(`${label}: expected a valid "publishedAt" date.`);
  }
  return resource;
}

function expectTutor(value: unknown, label: string): JsonRecord {
  const tutor = requireRecord(value, label);
  requireInteger(tutor.id, "id", label);
  requireNonEmptyString(tutor.slug, "slug", label);
  requireNonEmptyString(tutor.name, "name", label);
  requireNonEmptyString(tutor.subject, "subject", label);
  requireArray(tutor.resources, "resources", label);
  return tutor;
}

function resolveArtifactProductionUrl(): { value: string; source: string } {
  let artifactConfig: string;

  try {
    artifactConfig = readFileSync(ARTIFACT_DEPLOYMENT_CONFIG_URL, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SmokeCheckError(
      `Could not read the Well Tutored deployment configuration before making requests: ${reason}`,
    );
  }

  const productionEnvSection = artifactConfig.match(
    /(?:^|\n)\[services\.production\.env\]\s*\n([\s\S]*?)(?=\n(?:\[|\[\[)|$)/,
  )?.[1];
  const configuredUrl = productionEnvSection
    ?.match(/^\s*SMOKE_PRODUCTION_URL\s*=\s*"([^"\r\n]*)"\s*$/m)?.[1]
    ?.trim();

  if (!configuredUrl) {
    throw new SmokeCheckError(
      `The Well Tutored deployment configuration must define ${PRODUCTION_URL_CONFIG_KEY} before making requests.`,
    );
  }

  parseHttpUrl(configuredUrl, PRODUCTION_URL_CONFIG_KEY);

  return {
    value: configuredUrl,
    source: PRODUCTION_URL_CONFIG_KEY,
  };
}

function resolveConfiguredBaseUrl(): { value: string; source: string } {
  const explicit = process.env.SMOKE_BASE_URL?.trim();
  if (explicit) {
    return { value: explicit, source: "SMOKE_BASE_URL" };
  }

  if (process.argv.includes(PUBLISHED_CHECK_FLAG)) {
    const publishedUrlSource = process.env[PUBLISHED_URL_ENV_KEY]?.trim()
      ? PUBLISHED_URL_ENV_KEY
      : process.env[PUBLISHING_OUTPUT_URL_ENV_KEY]?.trim()
        ? PUBLISHING_OUTPUT_URL_ENV_KEY
        : undefined;
    const publishedUrl = publishedUrlSource
      ? process.env[publishedUrlSource]?.trim()
      : undefined;
    if (!publishedUrl) {
      throw new SmokeCheckError(
        `Published launch check requires ${PUBLISHED_URL_ENV_KEY} or ` +
          `${PUBLISHING_OUTPUT_URL_ENV_KEY} from the current Publishing metadata. ` +
          `The publish lifecycle must provide ${PUBLISHING_OUTPUT_URL_ENV_KEY}, ` +
          `or set ${PUBLISHED_URL_ENV_KEY} manually. ` +
          `Set SMOKE_BASE_URL for an intentional custom-domain or local check.`,
      );
    }

    const artifactUrl = resolveArtifactProductionUrl();
    const publishedOrigin = parseHttpUrl(
      publishedUrl,
      publishedUrlSource ?? PUBLISHED_URL_ENV_KEY,
    ).origin;
    const artifactOrigin = parseHttpUrl(
      artifactUrl.value,
      artifactUrl.source,
    ).origin;

    if (publishedOrigin !== artifactOrigin) {
      throw new SmokeCheckError(
        `Published deployment URL (${publishedUrlSource ?? PUBLISHED_URL_ENV_KEY}) "${publishedOrigin}" ` +
          `does not match the Well Tutored artifact smoke target ` +
          `(${PRODUCTION_URL_CONFIG_KEY}) "${artifactOrigin}". ` +
          `Update ${PRODUCTION_URL_CONFIG_KEY} in ` +
          `artifacts/well-tutored/.replit-artifact/artifact.toml ` +
          `after a domain change, or set SMOKE_BASE_URL for an intentional custom-domain or local check.`,
      );
    }

    return {
      value: publishedUrl,
      source: publishedUrlSource ?? PUBLISHED_URL_ENV_KEY,
    };
  }

  return resolveArtifactProductionUrl();
}

function parseHttpUrl(value: string, source: string): URL {
  let baseUrl: URL;
  try {
    baseUrl = new URL(value);
  } catch {
    throw new SmokeCheckError(
      `${source} must be an absolute HTTP(S) URL; received "${value}".`,
    );
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new SmokeCheckError(
      `${source} must use http or https; received "${baseUrl.protocol}".`,
    );
  }

  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "") || "/";
  return baseUrl;
}

export function resolveBaseUrl(): URL {
  const configured = resolveConfiguredBaseUrl();
  return parseHttpUrl(configured.value, configured.source);
}

export function resolveTimeoutMs(): number {
  const rawConfigured = process.env.SMOKE_TIMEOUT_MS;
  const configured =
    rawConfigured === undefined ? DEFAULT_TIMEOUT_MS : Number(rawConfigured);
  if (
    (rawConfigured !== undefined &&
      !SMOKE_TIMEOUT_FORMAT.test(rawConfigured)) ||
    !Number.isSafeInteger(configured) ||
    configured < SMOKE_TIMEOUT_MIN_MS ||
    configured > SMOKE_TIMEOUT_MAX_MS
  ) {
    throw new SmokeCheckError(
      `SMOKE_TIMEOUT_MS must be an integer number of milliseconds between ` +
        `${SMOKE_TIMEOUT_MIN_MS} and ${SMOKE_TIMEOUT_MAX_MS}; received "${rawConfigured}".`,
    );
  }
  return configured;
}

async function request(
  baseUrl: URL,
  path: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<ResponseData> {
  const url = new URL(path, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let body: string;

  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
    body = await response.text();
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    throw new SmokeCheckError(`${path}: request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  const finalUrl = new URL(response.url);
  if (finalUrl.origin !== baseUrl.origin) {
    throw new SmokeCheckError(
      `${path}: response redirected from configured origin "${baseUrl.origin}" ` +
        `to final origin "${finalUrl.origin}".`,
    );
  }

  return {
    response,
    body,
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function checkJson(
  baseUrl: URL,
  path: string,
  timeoutMs: number,
  expectedStatus: number,
): Promise<unknown> {
  const data = await request(baseUrl, path, timeoutMs);
  expectStatus(data, expectedStatus, path);
  return parseJson(data, path);
}

async function checkPublicPage(baseUrl: URL, path: string, timeoutMs: number) {
  const data = await request(baseUrl, path, timeoutMs, {
    headers: { Accept: "text/html" },
  });
  expectStatus(data, 200, path);
  if (!data.contentType.toLowerCase().includes("text/html")) {
    throw new SmokeCheckError(
      `${path}: expected HTML content, received "${data.contentType || "none"}".`,
    );
  }
  if (!/<title>Well Tutored<\/title>/i.test(data.body)) {
    throw new SmokeCheckError(
      `${path}: response did not contain the Well Tutored document.`,
    );
  }
}

export async function runSmokeCheck() {
  const baseUrl = resolveBaseUrl();
  const timeoutMs = resolveTimeoutMs();
  const passed: string[] = [];

  const health = requireRecord(
    await checkJson(baseUrl, "/api/healthz", timeoutMs, 200),
    "/api/healthz",
  );
  if (health.status !== "ok") {
    throw new SmokeCheckError(`/api/healthz: expected {"status":"ok"}.`);
  }
  passed.push("/api/healthz");

  const clerkEnvironment = requireRecord(
    await checkJson(baseUrl, "/api/__clerk/v1/environment", timeoutMs, 200),
    "/api/__clerk/v1/environment",
  );
  const clerkAuthConfig = requireRecord(
    clerkEnvironment.auth_config,
    "/api/__clerk/v1/environment.auth_config",
  );
  const clerkDisplayConfig = requireRecord(
    clerkEnvironment.display_config,
    "/api/__clerk/v1/environment.display_config",
  );
  if (clerkAuthConfig.object !== "auth_config") {
    throw new SmokeCheckError(
      `/api/__clerk/v1/environment: unexpected auth_config object.`,
    );
  }
  if (clerkDisplayConfig.object !== "display_config") {
    throw new SmokeCheckError(
      `/api/__clerk/v1/environment: unexpected display_config object.`,
    );
  }
  passed.push("/api/__clerk/v1/environment");

  const tutors = requireArray(
    await checkJson(baseUrl, "/api/tutors", timeoutMs, 200),
    "/api/tutors",
    "/api/tutors",
  );
  if (tutors.length === 0) {
    throw new SmokeCheckError(
      "/api/tutors: expected at least one published tutor.",
    );
  }
  const parsedTutors = tutors.map((tutor, index) =>
    expectTutor(tutor, `/api/tutors[${index}]`),
  );
  for (const [index, tutor] of parsedTutors.entries()) {
    const resources = requireArray(
      tutor.resources,
      `/api/tutors[${index}].resources`,
      "tutor",
    );
    resources.forEach((resource, resourceIndex) =>
      expectResource(
        resource,
        `/api/tutors[${index}].resources[${resourceIndex}]`,
      ),
    );
  }
  passed.push("/api/tutors");

  const resourceCatalogue = await checkJson(
    baseUrl,
    "/api/resources",
    timeoutMs,
    200,
  );
  let resources: unknown[];
  if (Array.isArray(resourceCatalogue)) {
    // The currently published deployment uses the pre-pagination list shape.
    resources = resourceCatalogue;
  } else {
    const catalogue = requireRecord(resourceCatalogue, "/api/resources");
    resources = requireArray(
      catalogue.items,
      "/api/resources.items",
      "/api/resources",
    );
    if (catalogue.page !== 1) {
      throw new SmokeCheckError("/api/resources: expected the first page.");
    }
    requireInteger(catalogue.pageSize, "pageSize", "/api/resources");
    requireInteger(catalogue.total, "total", "/api/resources");
    if (typeof catalogue.hasMore !== "boolean") {
      throw new SmokeCheckError('/api/resources: expected boolean "hasMore".');
    }
    if ((catalogue.total as number) < resources.length) {
      throw new SmokeCheckError(
        "/api/resources: total was smaller than items.length.",
      );
    }
  }
  if (resources.length === 0) {
    throw new SmokeCheckError(
      "/api/resources: expected at least one published resource.",
    );
  }
  const parsedResources = resources.map((resource, index) =>
    expectResource(resource, `/api/resources[${index}]`),
  );
  passed.push("/api/resources");

  for (const path of ["/", "/resources", "/enquire"]) {
    await checkPublicPage(baseUrl, path, timeoutMs);
    passed.push(path);
  }

  const tutorSlug = parsedTutors[0].slug as string;
  const tutorPath = `/tutors/${encodeURIComponent(tutorSlug)}`;
  await checkPublicPage(baseUrl, tutorPath, timeoutMs);
  passed.push(tutorPath);

  const resourceSlug = parsedResources[0].slug as string;
  const resourcePath = `/resources/${encodeURIComponent(resourceSlug)}`;
  await checkPublicPage(baseUrl, resourcePath, timeoutMs);
  passed.push(resourcePath);

  const invalidEnquiry = await request(baseUrl, "/api/enquiries", timeoutMs, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    // Deliberately fails validation before tutor lookup or database insertion.
    body: JSON.stringify({}),
  });
  expectStatus(invalidEnquiry, 400, "POST /api/enquiries (invalid payload)");
  const invalidEnquiryBody = requireRecord(
    parseJson(invalidEnquiry, "POST /api/enquiries (invalid payload)"),
    "POST /api/enquiries (invalid payload)",
  );
  requireNonEmptyString(
    invalidEnquiryBody.error,
    "error",
    "POST /api/enquiries (invalid payload)",
  );
  passed.push("POST /api/enquiries (invalid payload)");

  const recoveryHealth = requireRecord(
    await checkJson(baseUrl, "/api/healthz", timeoutMs, 200),
    "/api/healthz after invalid enquiry",
  );
  if (recoveryHealth.status !== "ok") {
    throw new SmokeCheckError(
      '/api/healthz after invalid enquiry: expected status "ok".',
    );
  }
  passed.push("/api/healthz after invalid enquiry");

  console.log(`Launch smoke check passed for ${baseUrl.origin}`);
  for (const check of passed) {
    console.log(`  ✓ ${check}`);
  }
}

export async function main(): Promise<number> {
  try {
    await runSmokeCheck();
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Launch smoke check failed: ${message}`);
    return 1;
  }
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
const currentFile = resolve(fileURLToPath(import.meta.url));

if (invokedFile === currentFile) {
  process.exitCode = await main();
}
