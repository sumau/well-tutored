# Schema changes are applied by a deliberate `push`, not by a migration history

There is no migrations directory and no migration runner. Schema changes are
applied by running Drizzle's `push` by hand against the target database from a
checkout, which diffs `lib/db/src/schema/` against the live database and alters
it to match. Nothing applies the schema automatically, and the Deploy pipeline
deliberately does not.

## Why

A reader will look for migrations and wonder where they went, so: this project
previously ran `drizzle-kit push --force` from a post-merge hook against the
live database, with no confirmation and no review — Drizzle will drop a column
to make the database match the schema. Removing that hook without replacing it
with a pipeline step is the point. A destructive operation that runs on merge is
one nobody watches; one you type is one you read the prompt for.

The trade-off accepted is real: `push` compares states rather than replaying a
history, so there is no record of how the schema got here, no down path, and no
way to express a data migration alongside a structural one. A single-owner
project with one Deployment can absorb that. A second environment, or a schema
change that has to move data, cannot.

## Considered options

- **Run `push --force` in the Deploy job.** Reproduces the previous behaviour
  and its hazard, while moving it somewhere it is seen even less than a
  post-merge hook.
- **Generated migrations (`drizzle-kit generate` + `migrate` in the pipeline).**
  The right end state, and the expected upgrade path from this decision. Not
  adopted at the same time as the deployment move, because bundling them makes
  both harder to review and puts an unexercised migration runner in front of the
  only database.

## Consequences

- A merge to `main` deploys code that may expect a schema the database does not
  have. Apply the schema **before** merging anything that changes
  `lib/db/src/schema/`.
- Review the diff of `lib/db/src/schema/` before pushing. Nothing downstream
  asks, and `push` against a populated database can drop a column.
- Use the database provider's direct (non-pooled) connection string for schema
  work; pooled connections are a poor fit for DDL.
