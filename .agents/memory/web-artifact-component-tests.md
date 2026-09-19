---
name: Web artifact component tests
description: Runtime details for testing React components in the web artifact with the existing node:test and tsx setup.
---

Use the web artifact's TypeScript configuration when running `tsx` tests from another workspace package; otherwise the `@/*` aliases are not resolved. JSX tests and imported components also need an explicit React namespace import when the config preserves JSX for Vite.

**Why:** The existing test command runs from the API package, while the component source relies on the web package's Vite/TypeScript aliases. The Node test runtime does not provide Vite's JSX transform.

**How to apply:** Keep component tests on `node:test` and `react-dom/server` when static state rendering is sufficient, and pass the web package tsconfig to `tsx`. For jsdom interaction tests, install the DOM before dynamically importing `react-dom/client`; importing ReactDOM first makes it choose its legacy input-event fallback.