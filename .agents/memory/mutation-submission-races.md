---
name: Mutation submission races
description: Prevent duplicate mutation requests when repeated UI events arrive before asynchronous mutation state rerenders.
---

An async mutation's pending flag is useful for rendering but may be stale inside a second event handler from the same interaction burst. Use a synchronous in-flight latch for the guard, and pair it with visible submitting state for the control and status announcement.

**Why:** Keyboard activation can deliver repeated submit events before React commits the first mutation's pending state, allowing duplicate records without a synchronous guard.

**How to apply:** For user actions that must be sent once, set the latch before starting the mutation and clear it in every settled callback; keep the submit control disabled from the visible submitting state until settlement.