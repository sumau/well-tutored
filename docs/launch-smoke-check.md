# Launch smoke check

Run the non-mutating production check manually:

```sh
pnpm smoke:launch
```

The default target is the configured Well Tutored production URL,
`https://welltutored.replit.app`. To check another published domain, override
it explicitly:

```sh
SMOKE_BASE_URL=https://example.replit.app pnpm smoke:launch
```

The root package also registers a `postpublish` lifecycle hook. It runs the
strict published-target variant automatically:

```sh
pnpm smoke:launch:published
```

Automatic mode requires the newly published URL to be available as
`SMOKE_BASE_URL`, `REPLIT_DEPLOYMENT_URL`, or `REPLIT_DOMAINS`. It never falls
back to the default domain in automatic mode, so a missing deployment URL
fails the publish validation instead of checking an older deployment. The
smoke command exits non-zero on any failed check, which makes the failure
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