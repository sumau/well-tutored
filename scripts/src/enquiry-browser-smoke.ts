import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { resolveBaseUrl, resolveTimeoutMs } from "./smoke-check.js";

const DEFAULT_CHROMIUM_PATH = "/repl/tools/bin/chromium";

class BrowserSmokeCheckError extends Error {}

async function activeElementId(page: Page) {
  return page.evaluate(() => {
    const activeElement = (globalThis as any).document.activeElement;
    return activeElement?.id || activeElement?.getAttribute("data-testid") || "";
  });
}

async function tabUntil(
  page: Page,
  expectedId: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.keyboard.press("Tab");
    if ((await activeElementId(page)) === expectedId) return;
  }
  throw new BrowserSmokeCheckError(
    `Keyboard focus did not reach "${expectedId}" before the ${timeoutMs}ms timeout.`,
  );
}

async function expectActive(
  page: Page,
  expectedId: string,
) {
  const actualId = await activeElementId(page);
  if (actualId !== expectedId) {
    throw new BrowserSmokeCheckError(
      `Expected keyboard focus on "${expectedId}", found "${actualId || "document body"}".`,
    );
  }
}

async function tabTo(
  page: Page,
  expectedId: string,
) {
  await page.keyboard.press("Tab");
  await expectActive(page, expectedId);
}

async function fillFocused(
  page: Page,
  value: string,
) {
  await page.keyboard.insertText(value);
}

async function expectSuccessfulReceipt(
  page: Page,
  timeoutMs: number,
) {
  const receipt = page.locator("[data-testid=enquiry-success]");
  await receipt.waitFor({ state: "visible", timeout: timeoutMs });
  if ((await receipt.getAttribute("role")) !== "status") {
    throw new BrowserSmokeCheckError("The success receipt is not a status announcement.");
  }
  if ((await receipt.getAttribute("aria-live")) !== "polite") {
    throw new BrowserSmokeCheckError("The success receipt is not announced politely.");
  }
  if (!(await receipt.innerText()).includes("Your enquiry has been sent securely.")) {
    throw new BrowserSmokeCheckError(
      "The success receipt did not contain the delivery confirmation.",
    );
  }
  await expectActive(page, "enquiry-success");
}

async function publishedAcceptingTutor(
  page: Page,
  baseUrl: URL,
  timeoutMs: number,
) {
  const response = await page.request.get(
    new URL("/api/tutors", baseUrl).toString(),
    { timeout: timeoutMs },
  );
  if (!response.ok()) {
    throw new BrowserSmokeCheckError(
      `Could not load published tutors before the profile check (HTTP ${response.status()}).`,
    );
  }

  const tutors: unknown = await response.json();
  if (!Array.isArray(tutors)) {
    throw new BrowserSmokeCheckError(
      "The published tutor catalogue was not an array.",
    );
  }

  const tutor = tutors.find(
    (candidate): candidate is { slug: string; name: string } =>
      typeof candidate === "object" &&
      candidate !== null &&
      typeof (candidate as { slug?: unknown }).slug === "string" &&
      typeof (candidate as { name?: unknown }).name === "string" &&
      (candidate as { availability?: unknown }).availability !== "unavailable",
  );
  if (!tutor) {
    throw new BrowserSmokeCheckError(
      "The published tutor catalogue did not contain an accepting tutor profile.",
    );
  }
  return tutor;
}

async function publishedUnavailableTutor(
  page: Page,
  baseUrl: URL,
  timeoutMs: number,
) {
  const response = await page.request.get(
    new URL("/api/tutors", baseUrl).toString(),
    { timeout: timeoutMs },
  );
  if (!response.ok()) {
    throw new BrowserSmokeCheckError(
      `Could not load published tutors before the unavailable profile check (HTTP ${response.status()}).`,
    );
  }

  const tutors: unknown = await response.json();
  if (!Array.isArray(tutors)) {
    throw new BrowserSmokeCheckError(
      "The published tutor catalogue was not an array.",
    );
  }

  const tutor = tutors.find(
    (candidate): candidate is { slug: string; name: string } =>
      typeof candidate === "object" &&
      candidate !== null &&
      typeof (candidate as { slug?: unknown }).slug === "string" &&
      typeof (candidate as { name?: unknown }).name === "string" &&
      (candidate as { availability?: unknown }).availability === "unavailable",
  );
  if (!tutor) {
    return undefined;
  }
  return tutor;
}

async function runTutorProfileSmokeCheck(
  page: Page,
  baseUrl: URL,
  timeoutMs: number,
) {
  const tutor = await publishedAcceptingTutor(page, baseUrl, timeoutMs);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    new URL(
      `/tutors/${encodeURIComponent(tutor.slug)}#enquire`,
      baseUrl,
    ).toString(),
    {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    },
  );
  await page.locator("[data-testid=enquiry-form]").waitFor({
    state: "visible",
    timeout: timeoutMs,
  });

  if (await page.locator("#enquiry-tutor").count() !== 0) {
    throw new BrowserSmokeCheckError(
      "The tutor profile enquiry unexpectedly rendered a tutor selector.",
    );
  }

  await tabUntil(page, "enquiry-parent-name", timeoutMs);
  await fillFocused(page, "Eleanor James");
  await tabTo(page, "enquiry-parent-email");
  await fillFocused(page, "eleanor@example.com");
  await tabTo(page, "enquiry-student-name");
  await fillFocused(page, "Maya");
  await tabTo(page, "enquiry-student-age");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  if (
    await page.locator("#enquiry-student-age").inputValue() !== "13-15"
  ) {
    throw new BrowserSmokeCheckError(
      "Keyboard selection did not choose the student's age on the tutor profile.",
    );
  }
  await tabTo(page, "enquiry-subject-level");
  await fillFocused(page, "GCSE English Literature");
  await tabTo(page, "enquiry-message");
  await fillFocused(page, "Maya would benefit from essay planning support.");
  await tabTo(page, "button-submit-enquiry");

  if (await page.locator("[data-testid=button-submit-enquiry]").isDisabled()) {
    throw new BrowserSmokeCheckError(
      "The completed tutor profile enquiry remained disabled at the submission step.",
    );
  }
  await page.keyboard.press("Enter");
  await expectSuccessfulReceipt(page, timeoutMs);

  console.log(`  ✓ tutor profile keyboard enquiry for ${tutor.name}`);

  const unavailableTutor = await publishedUnavailableTutor(page, baseUrl, timeoutMs);
  if (!unavailableTutor) {
    console.log("  - unavailable tutor profile check skipped because none are published");
    return;
  }

  await page.goto(
    new URL(
      `/tutors/${encodeURIComponent(unavailableTutor.slug)}#enquire`,
      baseUrl,
    ).toString(),
    {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    },
  );

  const unavailableNotice = page.locator("[data-testid=tutor-enquiry-unavailable]");
  await unavailableNotice.waitFor({ state: "visible", timeout: timeoutMs });
  if (!(await unavailableNotice.innerText()).includes("not currently accepting enquiries")) {
    throw new BrowserSmokeCheckError(
      "The unavailable tutor profile did not explain that enquiries are unavailable.",
    );
  }
  if (await page.locator("[data-testid=enquiry-form]").count() !== 0) {
    throw new BrowserSmokeCheckError(
      "The unavailable tutor profile unexpectedly rendered an enquiry form.",
    );
  }
  if (await page.locator("#enquiry-tutor").count() !== 0) {
    throw new BrowserSmokeCheckError(
      "The unavailable tutor profile unexpectedly rendered a preselected tutor control.",
    );
  }
  if (await page.locator("button[type=submit]").count() !== 0) {
    throw new BrowserSmokeCheckError(
      "The unavailable tutor profile unexpectedly exposed a submit control.",
    );
  }

  console.log(`  ✓ unavailable tutor profile blocks enquiries for ${unavailableTutor.name}`);
}

async function runBrowserSmokeCheck() {
  const baseUrl = resolveBaseUrl();
  const timeoutMs = resolveTimeoutMs();
  const browser = await chromium.launch({
    executablePath: process.env.SMOKE_CHROMIUM_PATH || DEFAULT_CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage();
    let interceptedEnquiryRequests = 0;
    await page.route("**/api/enquiries", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      interceptedEnquiryRequests += 1;
      if (interceptedEnquiryRequests === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            message: "The enquiry could not be recorded.",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: 42,
          tutorName: "Alice Smith",
          receivedAt: "2026-09-19T12:00:00.000Z",
          deliveryStatus: "delivered",
          message: "Your enquiry has been sent securely.",
        }),
      });
    });

    await page.goto(new URL("/enquire", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.locator("[data-testid=enquiry-form]").waitFor({
      state: "visible",
      timeout: timeoutMs,
    });

    await tabUntil(page, "enquiry-parent-name", timeoutMs);
    await fillFocused(page, "Eleanor James");
    await tabTo(page, "enquiry-parent-email");
    await fillFocused(page, "not-an-email");
    await tabTo(page, "enquiry-tutor");
    await page.keyboard.press("ArrowDown");
    if (!(await page.locator("#enquiry-tutor").inputValue())) {
      throw new BrowserSmokeCheckError(
        "Keyboard selection did not choose the available tutor.",
      );
    }
    await tabTo(page, "enquiry-student-name");
    await fillFocused(page, "Maya");
    await tabTo(page, "enquiry-student-age");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    if (
      await page.locator("#enquiry-student-age").inputValue() !== "13-15"
    ) {
      throw new BrowserSmokeCheckError(
        "Keyboard selection did not choose the student's age.",
      );
    }
    await tabTo(page, "enquiry-subject-level");
    await fillFocused(page, "GCSE English Literature");
    await tabTo(page, "enquiry-message");
    await fillFocused(page, "Maya would benefit from essay planning support.");

    await page.keyboard.press("Tab");
    if (await activeElementId(page) === "button-submit-enquiry") {
      throw new BrowserSmokeCheckError(
        "The disabled submit button incorrectly entered the native Tab order.",
      );
    }
    await page.keyboard.press("Shift+Tab");
    await expectActive(page, "enquiry-message");
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("Shift+Tab");
    }
    await expectActive(page, "enquiry-parent-email");
    await page.keyboard.press("Enter");
    await page.locator("#enquiry-parent-email-error").waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
    await expectActive(page, "enquiry-parent-email");
    if (
      (await page.locator("#enquiry-parent-email").getAttribute("aria-invalid")) !==
      "true"
    ) {
      throw new BrowserSmokeCheckError(
        "Invalid email submission did not announce the invalid field.",
      );
    }

    await page.keyboard.press("Control+A");
    await fillFocused(page, "eleanor@example.com");
    await tabTo(page, "enquiry-tutor");
    await tabTo(page, "enquiry-student-name");
    await tabTo(page, "enquiry-student-age");
    await tabTo(page, "enquiry-subject-level");
    await tabTo(page, "enquiry-message");
    await page.keyboard.press("Tab");
    await expectActive(page, "button-submit-enquiry");
    if (await page.locator("[data-testid=button-submit-enquiry]").isDisabled()) {
      throw new BrowserSmokeCheckError(
        "The completed enquiry remained disabled at the submission step.",
      );
    }
    await page.keyboard.press("Enter");

    const submitError = page.locator("[data-testid=error-enquiry-submit]");
    await submitError.waitFor({ state: "visible", timeout: timeoutMs });
    if ((await submitError.getAttribute("role")) !== "alert") {
      throw new BrowserSmokeCheckError(
        "The failed enquiry response did not announce a submission error.",
      );
    }
    if (
      (await submitError.innerText()) !==
      "We could not record your enquiry. Please check the details and try again."
    ) {
      throw new BrowserSmokeCheckError(
        "The failed enquiry response announced the wrong submission error.",
      );
    }
    if (interceptedEnquiryRequests !== 1) {
      throw new BrowserSmokeCheckError(
        "The failed enquiry response unexpectedly created or retried production data.",
      );
    }
    for (const [fieldId, expectedValue] of [
      ["enquiry-parent-name", "Eleanor James"],
      ["enquiry-parent-email", "eleanor@example.com"],
      ["enquiry-tutor", await page.locator("#enquiry-tutor").inputValue()],
      ["enquiry-student-name", "Maya"],
      ["enquiry-student-age", "13-15"],
      ["enquiry-subject-level", "GCSE English Literature"],
      ["enquiry-message", "Maya would benefit from essay planning support."],
    ] as const) {
      if (await page.locator(`#${fieldId}`).inputValue() !== expectedValue) {
        throw new BrowserSmokeCheckError(
          `The failed enquiry response cleared "${fieldId}" instead of preserving it.`,
        );
      }
    }
    await expectActive(page, "button-submit-enquiry");
    await page.keyboard.press("Enter");
    await expectSuccessfulReceipt(page, timeoutMs);
    if (Number(interceptedEnquiryRequests) !== 2) {
      throw new BrowserSmokeCheckError(
        "The keyboard retry did not submit the enquiry exactly once.",
      );
    }

    await runTutorProfileSmokeCheck(page, baseUrl, timeoutMs);

    console.log(`Enquiry keyboard smoke check passed for ${baseUrl.origin}`);
    console.log("  ✓ native Tab order and disabled-submit behavior");
    console.log("  ✓ Enter validation recovery");
    console.log("  ✓ announced server-error recovery and keyboard retry");
    console.log("  ✓ standalone keyboard submission and announced success receipt");
    console.log("  ✓ preselected-tutor profile submission and announced success receipt");
  } finally {
    await browser.close();
  }
}

export async function main(): Promise<number> {
  try {
    await runBrowserSmokeCheck();
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Enquiry keyboard smoke check failed: ${message}`);
    return 1;
  }
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
const currentFile = resolve(fileURLToPath(import.meta.url));

if (invokedFile === currentFile) {
  process.exitCode = await main();
}