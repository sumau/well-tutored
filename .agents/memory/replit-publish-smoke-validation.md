---
name: Replit publish smoke validation
description: Replit does not expose a dedicated post-publish callback, so publish-time checks need an explicit lifecycle integration and published URL.
---

Replit does not provide a dedicated post-publish hook in project configuration. A publish validation integration must invoke the smoke command through an available package or pipeline lifecycle, and automatic mode must receive the newly published URL explicitly or from deployment domain environment variables.

**Why:** A build hook runs before the new deployment is promoted, and silently falling back to a fixed production URL can validate an older release instead of the release that was just published.

**How to apply:** Keep automatic checks strict about their target URL; reserve the fixed production URL fallback for manual smoke runs.