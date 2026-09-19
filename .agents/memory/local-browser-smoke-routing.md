---
name: Local browser smoke routing
description: Why browser smoke checks need the Replit proxy instead of a direct Vite port.
---

The direct Well Tutored Vite development port serves the frontend but does not proxy `/api` requests. Browser smoke checks that exercise the real frontend and API together must target the proxied development domain (or a deployed URL), not the direct local web port.

**Why:** A direct-port smoke run can load the HTML successfully while the React form remains stuck in its loading state because API requests are answered by the Vite history fallback.

**How to apply:** Set `SMOKE_BASE_URL` to the current proxied development domain for local real-browser checks; reserve direct ports for frontend-only checks.