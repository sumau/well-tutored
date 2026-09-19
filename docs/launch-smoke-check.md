# Launch smoke check

Run the non-mutating production check after publishing:

```sh
pnpm smoke:launch
```

The default target is the configured Well Tutored production URL,
`https://welltutored.replit.app`. To check another published domain, override
it explicitly:

```sh
SMOKE_BASE_URL=https://example.replit.app pnpm smoke:launch
```

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