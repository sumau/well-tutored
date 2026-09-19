---
name: Replit publish smoke validation
description: Replit does not expose a dedicated post-publish callback, so publish-time checks need an explicit lifecycle integration and published URL.
---

Replit does not provide a dedicated post-publish hook in project configuration. A publish validation integration must invoke the smoke command through an available package or pipeline lifecycle. Keep the smoke target in the Well Tutored artifact's production deployment configuration, require the current Publishing URL as explicit metadata for published-mode checks, and allow an explicit override only for custom domains or local verification.

**Why:** A build hook runs before the new deployment is promoted, and silently falling back to a fixed production URL can validate an older release instead of the release that was just published.

**How to apply:** Resolve the default target from the artifact deployment configuration before issuing requests. In published mode, compare the current Publishing URL to that target and reject missing or mismatched metadata early; do not infer it from `REPLIT_DOMAINS`, which can be the development domain. Keep the explicit override available for custom domains and local checks.

Browser checks against published data should assert that keyboard selection
chooses a non-placeholder live option rather than relying on a fixture slug.

**Why:** Published catalogue records can change independently of the smoke
script, and a fixed test slug caused a valid browser flow to fail.

**How to apply:** Use stable form semantics and response contracts for
assertions; only hard-code values when the published contract guarantees them.