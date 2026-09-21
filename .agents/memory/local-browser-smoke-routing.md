---
name: Local browser smoke routing
description: Why browser smoke checks must target the Vite dev server rather than a direct API or preview port.
---

Browser smoke checks that exercise the real frontend and API together must
target the Vite dev server, which proxies `/api` to the API service. The API
service must also be running; otherwise the proxy returns 502 and the frontend
falls into its data-load error state.

**Why:** A smoke run against a port that serves the frontend without proxying
`/api` can load the HTML successfully while the React form remains stuck in its
loading state, because API requests are answered by Vite's history fallback.

**How to apply:** Bring the `api` and `web` services up, then set
`SMOKE_BASE_URL` to the dev server's origin. The browser check also needs
`SMOKE_CHROMIUM_PATH`: `playwright-core` bundles no browser and these images
carry none.
