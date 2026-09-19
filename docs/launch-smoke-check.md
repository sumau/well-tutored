# Launch smoke check

Run the non-mutating production check manually:

```sh
pnpm smoke:launch
```

The default target is the production URL in the Well Tutored artifact
deployment configuration (`artifacts/well-tutored/.replit-artifact/artifact.toml`).
That value is the single source used by both manual and post-publish checks. To
check another published domain, override it explicitly:

```sh
SMOKE_BASE_URL=https://example.replit.app pnpm smoke:launch
```

The root package also registers a `postpublish` lifecycle hook. It runs the
strict published-target variant automatically. The lifecycle receives the URL
reported by the current Publishing run through `REPLIT_PUBLISHED_URL` and
passes it to the smoke command as `SMOKE_PUBLISHED_URL`:

```sh
REPLIT_PUBLISHED_URL=https://welltutored.replit.app pnpm smoke:launch:published:lifecycle
```

If the Publishing output is unavailable, the lifecycle fails before making
requests with an actionable error. It never substitutes the checked-in
`SMOKE_PRODUCTION_URL` value or `REPLIT_DOMAINS`, which can point to a
development domain. For a direct manual run, provide the current URL explicitly:

```sh
SMOKE_PUBLISHED_URL=https://welltutored.replit.app pnpm smoke:launch:published
```

Published mode compares `SMOKE_PUBLISHED_URL` with
`SMOKE_PRODUCTION_URL` in the artifact deployment configuration before making
requests. If they differ, update the artifact value after a domain change and
rerun the check. Missing or mismatched metadata fails with an actionable
message instead of silently checking an older deployment.

`SMOKE_BASE_URL` remains available as an explicit override for custom domains
and local verification, including the published command:

```sh
SMOKE_BASE_URL=https://example.test pnpm smoke:launch:published
```

When the override is set, it intentionally skips the published-target
synchronization comparison. The artifact deployment configuration must still
be readable and define a valid URL for the default manual check.
Every request still must finish on the configured target origin. If the target
redirects to a different origin, the check fails and reports both the
configured and final origins. This catches an old published hostname that
redirects to a replacement domain before its responses are treated as healthy.
The smoke command exits non-zero on any failed check, which makes the failure
visible in the publish output.

The check does not require workspace credentials. It verifies:

- the API health response at `/api/healthz`;
- the Clerk Frontend API proxy at `/api/__clerk/v1/environment`;
- tutor and resource catalogue responses, including non-empty published data
  and the response fields used by public catalogue links;
- the public home, resources, enquiry, tutor-profile, and resource-detail
  pages;
- invalid enquiry recovery by sending `{}` to `POST /api/enquiries`, expecting
  a `400` validation response, and checking health again afterward.

The published enquiry form also has a real-browser keyboard smoke check:

```sh
SMOKE_PUBLISHED_URL=https://welltutored.replit.app pnpm smoke:enquiry:published
```

It uses the current Publishing URL rules above, traverses the form with native
Tab and Enter actions, verifies validation recovery and disabled-submit
behavior, and intercepts the final response so the check does not create a
production enquiry.

For local or custom-domain verification, use the explicit override:

```sh
SMOKE_BASE_URL=https://example.test pnpm smoke:enquiry
```

The enquiry payload is intentionally invalid, so the API rejects it before
looking up a tutor or inserting an enquiry. The command exits non-zero with
the failing endpoint and response contract when a check does not match.
