import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLISHED_URL_ENV_KEY = "SMOKE_PUBLISHED_URL";
const PUBLISHING_OUTPUT_URL_ENV_KEY = "REPLIT_PUBLISHED_URL";
const SMOKE_BASE_URL_ENV_KEY = "SMOKE_BASE_URL";

export type PublishedUrl = {
  value: string;
  source: typeof PUBLISHED_URL_ENV_KEY | typeof PUBLISHING_OUTPUT_URL_ENV_KEY;
};

export function resolvePublishedUrl(
  environment: NodeJS.ProcessEnv = process.env,
): PublishedUrl | undefined {
  const explicitSmokeUrl = environment[PUBLISHED_URL_ENV_KEY]?.trim();
  if (explicitSmokeUrl) {
    return { value: explicitSmokeUrl, source: PUBLISHED_URL_ENV_KEY };
  }

  const publishingOutputUrl = environment[PUBLISHING_OUTPUT_URL_ENV_KEY]?.trim();
  if (publishingOutputUrl) {
    return { value: publishingOutputUrl, source: PUBLISHING_OUTPUT_URL_ENV_KEY };
  }

  return undefined;
}

function failWithoutPublishingUrl(): never {
  throw new Error(
    `Published launch lifecycle requires the current Publishing URL. ` +
      `The Publishing output must provide ${PUBLISHING_OUTPUT_URL_ENV_KEY}, ` +
      `or set ${PUBLISHED_URL_ENV_KEY} manually. ` +
      `Set ${SMOKE_BASE_URL_ENV_KEY} for an intentional custom-domain or local check.`,
  );
}

export function runPublishedSmoke(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const publishedUrl = resolvePublishedUrl(environment);
  if (!publishedUrl && !environment[SMOKE_BASE_URL_ENV_KEY]?.trim()) {
    failWithoutPublishingUrl();
  }

  const child = spawn(
    "pnpm",
    ["--filter", "@workspace/scripts", "run", "smoke:published"],
    {
      env: {
        ...environment,
        ...(publishedUrl
          ? { [publishedUrl.source]: publishedUrl.value }
          : {}),
      },
      stdio: "inherit",
    },
  );

  return new Promise((resolveResult, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (typeof exitCode === "number") {
        resolveResult(exitCode);
        return;
      }
      reject(
        new Error(
          `Published launch smoke check stopped by ${signal ?? "an unknown signal"}.`,
        ),
      );
    });
  });
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
const currentFile = resolve(fileURLToPath(import.meta.url));

if (invokedFile === currentFile) {
  try {
    process.exitCode = await runPublishedSmoke();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Published launch lifecycle failed: ${message}`);
    process.exitCode = 1;
  }
}
