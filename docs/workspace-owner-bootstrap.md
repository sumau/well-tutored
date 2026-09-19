# Workspace owner bootstrap

Workspace ownership is stored in the database. `WORKSPACE_ALLOWED_EMAILS` only
controls which verified email addresses may create Workspace accounts; it does
not grant the `owner` role.

## When this is needed

Use this process only when a development database has no owner account, such as
after the database is first created or restored from an empty state. It is a
one-time provisioning step, not application startup behavior.

## Development procedure

1. Confirm that the target person has a Clerk account with a verified primary
   email address.
2. Confirm that the target email is present in the development
   `WORKSPACE_ALLOWED_EMAILS` secret.
3. Have the target person sign in once so the API creates their pending
   `workspace_accounts` record.
4. Verify that the development database has zero rows with `role = 'owner'`.
5. Run a guarded, development-only update for the exact target email:

   ```sql
   UPDATE studio_accounts
   SET role = 'owner', updated_at = NOW()
   WHERE lower(email) = lower($1)
     AND role = 'pending'
     AND NOT EXISTS (
       SELECT 1
       FROM studio_accounts
       WHERE role = 'owner'
     )
   RETURNING id, role;
   ```

   Supply the intended owner email as the parameter. The `studio_accounts`
   table name is a legacy database identifier and is intentionally unchanged.

6. Sign in again and open the Workspace. The new owner can then approve users,
   assign tutor profiles, and manage Workspace content through the UI.

## Safety rules

- Run this against the development database only unless a separate production
  recovery procedure has been explicitly approved.
- Do not add automatic owner elevation to server startup or normal login
  handling.
- Do not run the update if an owner already exists.
- Do not change an existing owner through this bootstrap step.
- Keep `WORKSPACE_ALLOWED_EMAILS` separate from owner role state.

## Database recovery

Recreating a database removes all account roles, tutor assignments, content,
and enquiries. Clerk users remain separate from the database, but their
Workspace account records must be recreated. After the schema and deployment
configuration are restored, repeat the guarded one-time procedure above for the
intended owner, then use the normal Workspace approval flow.