---
name: Replit publish smoke validation
description: Replit does not expose a dedicated post-publish callback, so publish-time checks need an explicit lifecycle integration and published URL.
---

Replit does not provide a dedicated post-publish hook in project configuration. A publish validation integration must invoke the smoke command through an available package or pipeline lifecycle. Keep the smoke target in the Well Tutored artifact's production deployment configuration, and allow an explicit override only for custom domains or local verification.

**Why:** A build hook runs before the new deployment is promoted, and silently falling back to a fixed production URL can validate an older release instead of the release that was just published.

**How to apply:** Resolve the default target from the artifact deployment configuration before issuing requests. Reject a missing or malformed configured URL early; do not infer it from `REPLIT_DOMAINS`, which can be the development domain.