---
name: JSDOM page test harness
description: Browser globals needed when component tests render Wouter pages outside a browser.
---

When rendering Wouter-backed pages in tsx tests with JSDOM, install `location`, `history`, and the window event listener functions on `globalThis`; JSX-rendered modules may also need explicit React imports under this test transform.

**Why:** The test runner does not automatically mirror the JSDOM window onto global browser names, so Wouter fails before page assertions run.

**How to apply:** Add the globals in the page test's DOM setup and keep the test-specific React imports local to modules exercised by the tsx transform.