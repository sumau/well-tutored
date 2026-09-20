---
name: Development smoke checks
description: Environment-specific constraints for running launch smoke checks against the Replit development domain.
---

Development launch smoke checks must use an explicit development target and
must not require the Clerk Frontend API proxy. The API enables that proxy only
in production, so a development request to `/api/__clerk/v1/environment` is
expected to be unavailable.

**Why:** A generic production smoke check against the proxied development
domain produced a false failure even though the API, catalogue, public pages,
and enquiry flow were healthy.

**How to apply:** Keep development and published smoke modes separate. Require
`SMOKE_BASE_URL` for development mode, skip only the production-only Clerk
proxy assertion there, and retain the assertion for published checks.