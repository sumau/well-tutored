---
name: Development smoke checks
description: Environment-specific constraints for running launch smoke checks against the local development stack.
---

Development launch smoke checks must use an explicit target and must not
require the Clerk Frontend API proxy. The API enables that proxy only in
production, so a development request to `/api/__clerk/v1/environment` is
expected to be unavailable.

**Why:** A generic production smoke check against a development target
produced a false failure even though the API, catalogue, public pages, and
enquiry flow were healthy.

**How to apply:** Keep the development mode separate. `SMOKE_BASE_URL` is
required in every mode and has no default, so no run can accidentally pick its
own target; `--dev` skips only the production-only Clerk proxy assertion, and
every other mode retains it.
