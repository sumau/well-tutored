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
strict published-target variant automatically:

```sh
pnpm smoke:launch:published
```

Automatic mode uses the same artifact deployment URL and does not read
`REPLIT_DOMAINS` (which can point to a development domain). If the deployment
configuration is missing, unreadable, or does not define a valid URL, the
check fails before making any requests. `SMOKE_BASE_URL` remains available for
custom domains and local verification, including the post-publish command.
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

The enquiry payload is intentionally invalid, so the API rejects it before
looking up a tutor or inserting an enquiry. The command exits non-zero with
the failing endpoint and response contract when a check does not match.
