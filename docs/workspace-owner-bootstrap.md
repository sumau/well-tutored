# Workspace owner bootstrap

Workspace ownership is stored in the database. The API currently requires a
verified primary Clerk email address, then creates a `pending` Workspace
account for any verified email that does not already have an account.

`WORKSPACE_ALLOWED_EMAILS` is documented here as a possible allowlist, but the
current runtime does not read or enforce that variable. It must not be treated
as an access-control mechanism unless the account-provisioning service is
updated to enforce it.

## When this is needed

Use this process only when a development database has no owner account, such as
after the database is first created or restored from an empty state. It is a
one-time provisioning step, not application startup behavior.

## Development procedure

1. Confirm that the target person has a Clerk account with a verified primary
   email address.
2. Have the target person sign in once so the API creates their pending
   `workspace_accounts` record.
3. Verify that the development database has zero rows with `role = 'owner'`.
4. Run a guarded, development-only update for the exact target email:

   ```sql
   UPDATE workspace_accounts
   SET role = 'owner', updated_at = NOW()
   WHERE lower(email) = lower($1)
     AND role = 'pending'
     AND NOT EXISTS (
       SELECT 1
        FROM workspace_accounts
       WHERE role = 'owner'
     )
   RETURNING id, role;
   ```

    Supply the intended owner email as the parameter. The table is named
    `workspace_accounts` to match the application vocabulary.

5. Sign in again and open the Workspace. The new owner can then approve users,
   assign tutor profiles, and manage Workspace content through the UI.

Step 2 is easy to skip: the account must be created through the sign-up flow
before any of this applies, because the pending record is written on first
sign-in and not before. When the development database runs in containers,
steps 3 and 4 go through `psql` in the `db` service — see
[Local Docker development](local-docker.md) for the exact commands, including
a `+clerk_test` address that needs no real mailbox.

## Safety rules

- Run this against the development database only unless a separate production
  recovery procedure has been explicitly approved.
- Do not add automatic owner elevation to server startup or normal login
  handling.
- Do not run the update if an owner already exists.
- Do not change an existing owner through this bootstrap step.
- Keep owner role state separate from any future email-allowlist policy.

## Database recovery

Recreating a database removes all account roles, tutor assignments, content,
and enquiries. Clerk users remain separate from the database, but their
Workspace account records must be recreated. After the schema and deployment
configuration are restored, repeat the guarded one-time procedure above for the
intended owner, then use the normal Workspace approval flow.