import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tutor } from "@workspace/api-client-react";

const tutor: Tutor = {
  id: 1,
  slug: "alice-smith",
  name: "Alice Smith",
  firstName: "Alice",
  lastName: "Smith",
  initials: "AS",
  subject: "English",
  support: "GCSE English",
  profileSummary: "A supportive English tutor.",
  university: "University of Oxford",
  qualification: "BA English",
  bio: "Alice helps students build confidence.",
  style: "Warm and structured",
  teachingIntro: "Clear explanations and practical guidance.",
  teachingPoints: [{ title: "Clarity", body: "Lessons are structured around the student's goals." }],
  rate: 45,
  availability: "accepting",
  tint: "#123456",
  resources: [],
};

type RenderedForm = {
  container: HTMLDivElement;
  root: Root;
  queryClient: QueryClient;
  dom: JSDOM;
};

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "attachEvent", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "detachEvent", {
    configurable: true,
    value: () => undefined,
  });

  return dom;
}

async function renderForm(): Promise<RenderedForm> {
  const dom = installDom();
  const [{ createRoot }, { EnquiryForm }] = await Promise.all([
    import("react-dom/client"),
    import("./EnquiryForm"),
  ]);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <EnquiryForm tutor={tutor} />
      </QueryClientProvider>,
    );
  });

  return { container, root, queryClient, dom };
}

async function cleanupForm({ container, root, queryClient, dom }: RenderedForm) {
  await act(async () => {
    root.unmount();
  });
  queryClient.clear();
  container.remove();
  dom.window.close();
}

function submitForm(form: HTMLFormElement) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", {
    bubbles: true,
  }));
}

function fillCompleteForm(container: HTMLDivElement, overrides: Record<string, string> = {}) {
  const values = {
    name: "Eleanor James",
    email: "eleanor@example.com",
    studentName: "Maya",
    studentAge: "13-15",
    subjectLevel: "GCSE English Literature",
    message: "Maya would benefit from essay planning support.",
    ...overrides,
  };

  setFieldValue(container.querySelector("#enquiry-parent-name")!, values.name);
  setFieldValue(container.querySelector("#enquiry-parent-email")!, values.email);
  setFieldValue(container.querySelector("#enquiry-student-name")!, values.studentName);
  setFieldValue(container.querySelector("#enquiry-student-age")!, values.studentAge);
  setFieldValue(container.querySelector("#enquiry-subject-level")!, values.subjectLevel);
  setFieldValue(container.querySelector("#enquiry-message")!, values.message);
}

test("empty submission focuses the first invalid field and exposes its error", async () => {
  const rendered = await renderForm();
  const form = rendered.container.querySelector<HTMLFormElement>("[data-testid=enquiry-form]")!;
  const name = rendered.container.querySelector<HTMLInputElement>("#enquiry-parent-name")!;

  await act(async () => {
    submitForm(form);
  });

  assert.equal(document.activeElement, name);
  assert.equal(name.getAttribute("aria-invalid"), "true");
  assert.equal(name.getAttribute("aria-describedby"), "enquiry-parent-name-error");

  const error = rendered.container.querySelector("#enquiry-parent-name-error")!;
  assert.equal(error.getAttribute("role"), "alert");
  assert.equal(error.textContent, "Enter the parent or guardian's name.");

  await cleanupForm(rendered);
});

test("invalid email and short message errors are announced and tied to their fields", async () => {
  const rendered = await renderForm();
  const form = rendered.container.querySelector<HTMLFormElement>("[data-testid=enquiry-form]")!;

  await act(async () => {
    fillCompleteForm(rendered.container, {
      email: "not-an-email",
      message: "Too short",
    });
    submitForm(form);
  });

  const email = rendered.container.querySelector<HTMLInputElement>("#enquiry-parent-email")!;
  const emailError = rendered.container.querySelector("#enquiry-parent-email-error")!;
  const message = rendered.container.querySelector<HTMLTextAreaElement>("#enquiry-message")!;
  const messageError = rendered.container.querySelector("#enquiry-message-error")!;

  assert.equal(email.getAttribute("aria-invalid"), "true");
  assert.equal(email.getAttribute("aria-describedby"), "enquiry-parent-email-error");
  assert.equal(emailError.getAttribute("role"), "alert");
  assert.equal(emailError.textContent, "Enter a valid email address.");
  assert.equal(message.getAttribute("aria-invalid"), "true");
  assert.equal(message.getAttribute("aria-describedby"), "enquiry-message-error");
  assert.equal(messageError.getAttribute("role"), "alert");
  assert.equal(messageError.textContent, "Use at least 10 characters so the tutor has useful context.");

  await cleanupForm(rendered);
});

test("a failed submission keeps an announced form error and a successful retry focuses the receipt", async () => {
  const rendered = await renderForm();
  const form = rendered.container.querySelector<HTMLFormElement>("[data-testid=enquiry-form]")!;
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;

    if (requestCount === 1) {
      return new Response(
        JSON.stringify({ message: "The enquiry could not be recorded." }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        id: 42,
        tutorName: "Alice Smith",
        receivedAt: "2026-09-19T12:00:00.000Z",
        deliveryStatus: "delivered",
        message: "Your enquiry has been sent securely.",
      }),
      {
        status: 201,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    await act(async () => {
      fillCompleteForm(rendered.container);
    });

    await act(async () => {
      submitForm(form);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const submitError = rendered.container.querySelector("[data-testid=error-enquiry-submit]")!;
    assert.equal(submitError.getAttribute("role"), "alert");
    assert.equal(
      submitError.textContent,
      "We could not record your enquiry. Please check the details and try again.",
    );
    assert.equal(form.contains(submitError), true);
    assert.equal(rendered.container.querySelector("[data-testid=enquiry-success]"), null);

    await act(async () => {
      submitForm(form);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const receipt = rendered.container.querySelector("[data-testid=enquiry-success]")!;
    assert.equal(requestCount, 2);
    assert.equal(document.activeElement, receipt);
    assert.equal(receipt.getAttribute("role"), "status");
    assert.equal(receipt.getAttribute("aria-live"), "polite");
    assert.match(receipt.textContent ?? "", /Message delivered/);
    assert.match(receipt.textContent ?? "", /Your enquiry has been sent securely\./);
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupForm(rendered);
  }
});

test("a successful receipt receives focus and announces the delivery outcome", async () => {
  const rendered = await renderForm();
  const form = rendered.container.querySelector<HTMLFormElement>("[data-testid=enquiry-form]")!;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: 42,
        tutorName: "Alice Smith",
        receivedAt: "2026-09-19T12:00:00.000Z",
        deliveryStatus: "delivered",
        message: "Your enquiry has been sent securely.",
      }),
      {
        status: 201,
        headers: { "content-type": "application/json" },
      },
    );

  try {
    await act(async () => {
      fillCompleteForm(rendered.container);
    });

    assert.equal(
      rendered.container.querySelector<HTMLButtonElement>("[data-testid=button-submit-enquiry]")?.disabled,
      false,
    );

    await act(async () => {
      submitForm(form);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const receipt = rendered.container.querySelector("[data-testid=enquiry-success]")!;
    assert.equal(document.activeElement, receipt);
    assert.equal(receipt.getAttribute("role"), "status");
    assert.equal(receipt.getAttribute("aria-live"), "polite");
    assert.match(receipt.textContent ?? "", /Message delivered/);
    assert.match(receipt.textContent ?? "", /Your enquiry has been sent securely\./);
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupForm(rendered);
  }
});