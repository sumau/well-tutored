# Documentation review

Review `PROJECT.md` and every Markdown file matching `docs/**/*.md` against the
current codebase in this same repository.

Inspect relevant source files, package manifests, workflows, API routes,
database schema, OpenAPI specification, and artifact configuration under this
repository root.

## Look for

- Commands that no longer work
- File paths that no longer exist
- Architecture descriptions that no longer match the code
- Missing or outdated routes
- Incorrect environment-variable instructions
- Contradictions between documentation files
- Important behavior that is not documented
- Duplication across documentation files
- Documentation that is too detailed

## Ignore

- `.local/skills/**`
- `.local/tasks/**`
- `.agents/memory/**`
- `node_modules/**`
- `dist/**`
- Generated output
- `attached_assets/**`
- Any repository other than this one

## Rules

- Do not modify files.
- When actionable issues are found, create exactly one consolidated project task
  using the output structure below. Do not create multiple tasks.
- Do not treat attached files as project documentation unless explicitly listed.
- Always create zero or one consolidated task, never multiple tasks.

## Output

If no actionable issues are found, output exactly:

```text
No documentation task needed.
```

If issues are found, create exactly one consolidated project task using this
structure, then report the created task using the same Markdown:

```markdown
# Keep project documentation aligned with the codebase

## What & Why

Review and update the project documentation so that it accurately reflects the
current codebase, commands, file structure, architecture, routes,
environment variables, and operating procedures.

## Done looks like

- All documented commands match the current package scripts and workflows.
- Documented file paths and project structure match the repository.
- Architecture and route descriptions match the implementation.
- Environment-variable and setup instructions are accurate.
- Contradictions between `PROJECT.md` and `docs/` are resolved.
- Updated documentation is checked against the relevant source files.

## Out of scope

- Changing application behavior solely to match outdated documentation
- Rewriting the documentation structure
- Updating task plans or Agent memory files

## Steps

1. Review the current documentation against the relevant codebase files.
2. Correct outdated or inaccurate documentation.
3. Add missing information important for development, operation, or maintenance.
4. Resolve contradictions between documentation files.
5. Verify the documented commands and instructions.
6. Summarize the documentation changes and any remaining uncertainties.

## Findings to address

### Finding 1: <short description>

- Documentation: <verified file path and section>
- Codebase evidence: <verified file path and relevant behavior>
- Required correction: <what should change>
```

Include verified documentation paths and codebase evidence inline under each
finding.