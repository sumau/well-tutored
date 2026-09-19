---
name: Clerk test isolation
description: The Clerk user client accessor returns transient API objects, which affects test stubbing.
---

When tests replace Clerk user API methods, patch the shared user API prototype rather than assigning through `clerkClient.users`, because the accessor can return a fresh object and discard instance-level stubs.

**Why:** Instance-level replacement appeared to succeed but production route calls still reached Clerk and required a live secret.

**How to apply:** Capture and restore the prototype method around the test lifecycle, keeping the fake user data local to the test.