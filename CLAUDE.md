# CLAUDE.md

## Read this first

[replit.md](replit.md) is the source of truth for this project: stack, run
commands, where things live, architecture decisions, and gotchas. Read it
before answering questions about how the project works or making changes.

Keep it that way. When something changes that belongs in a project brief,
update `replit.md`, not this file. This file covers only what differs when
working through Claude Code rather than in the Replit workspace.

## Replit is being removed

[REPLIT-REMOVAL-PLAN.md](REPLIT-REMOVAL-PLAN.md) is the plan: three ordered
changes, with the ordering constraint and the file-level change sets. Read it
before touching anything Replit-related, including the deployment docs — much
of what `replit.md` and `docs/deploy.md` describe is the thing being deleted,
so they read as current when they are not.

[CONTEXT.md](CONTEXT.md) is the glossary and [docs/adr/](docs/adr/) holds the
decisions behind the move. Delete this section and the plan when its last
change lands.

## Running things here

Everything runs in containers — there is no host Node, pnpm, or PostgreSQL.
[docs/local-docker.md](docs/local-docker.md) has the full workflow; the short
version:

```
docker compose up api web          # http://localhost:5173
docker compose run --rm migrate    # apply schema changes
docker compose run --rm test       # full CI suite
```

So the commands in `replit.md` are correct but need a prefix: `docker compose
exec api <command>` against a running service, or `docker compose run --rm
--entrypoint bash api -lc '<command>'` for a one-off.

## Replit is still the deployment

Replit builds and hosts the published app from this repository, so GitHub is
the sync point between the two. Do not edit the same branch from both Claude
Code and the Replit workspace at once — there is no locking, and the result is
a manual conflict resolution.

Two consequences worth remembering:

- **Schema changes are applied destructively on merge.** `scripts/post-merge.sh`
  runs `drizzle-kit push --force` against the Replit database after a merge,
  with no confirmation. Drizzle will drop a column to match the schema. Read
  the diff of `lib/db/src/schema/` before merging; nothing downstream asks.
- **The lockfile must stay stable.** The deployment build and the post-merge
  hook both install with `--frozen-lockfile`. `package.json` pins
  `packageManager`, and `docker/Dockerfile.dev` pins the matching pnpm; keep
  them in step or the deploy fails on a lockfile it did not expect.

## Documentation is validated

`pnpm run docs:check` parses `replit.md` and everything under `docs/`, and
fails when a documented `pnpm` command names a script that does not exist or a
local link does not resolve. It runs as part of `pnpm run build`, so a careless
doc edit breaks the deployment build.

It does not check this file. Claims here are unverified, so keep them few.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `sumau/well-tutored`, driven by the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its role name.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root.
See `docs/agents/domain.md`.
