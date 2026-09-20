---
name: Public and authenticated startup boundary
description: Public browsing must stay independent from Clerk while auth and workspace code remains deferred.
---

Public route modules must not import Clerk, Clerk themes, or Clerk-dependent layouts. Route selection should defer the authenticated app until sign-in, sign-up, or workspace paths are entered.

**Why:** Public visitors should not initialize Clerk or download its theme/authenticated route code, while auth navigation still needs the existing provider configuration.

**How to apply:** Keep shared public providers and route metadata Clerk-free; place Clerk providers, auth layouts, and workspace routes behind a lazy authenticated app boundary.