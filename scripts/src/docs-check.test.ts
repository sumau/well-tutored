import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checkDocumentation,
  extractDocumentedCommands,
  extractLocalLinks,
  extractWorkflowReferences,
  validateDocumentedCommands,
  validateLocalLinks,
  validateWorkflowReferences,
  type PackageManifestRecord,
} from "./docs-check.js";

test("extracts inline and fenced pnpm commands with source locations", () => {
  const commands = extractDocumentedCommands(
    [
      "- `pnpm --filter @workspace/api-server run dev` — start the API",
      "",
      "```sh",
      "SMOKE_BASE_URL=https://example.test pnpm smoke:launch",
      "```",
      "",
      "The phrase pnpm workspaces is not a command.",
    ].join("\n"),
    "docs/example.md",
  );

  assert.deepEqual(commands, [
    {
      filePath: "docs/example.md",
      lineNumber: 1,
      command: "pnpm --filter @workspace/api-server run dev",
    },
    {
      filePath: "docs/example.md",
      lineNumber: 4,
      command: "pnpm smoke:launch",
    },
  ]);
});

test("validates root and filtered workspace scripts", () => {
  const manifests: PackageManifestRecord[] = [
    {
      filePath: "package.json",
      manifest: { scripts: { build: "echo build" } },
    },
    {
      filePath: "artifacts/api-server/package.json",
      manifest: {
        name: "@workspace/api-server",
        scripts: { dev: "echo dev" },
      },
    },
  ];

  assert.deepEqual(
    validateDocumentedCommands(
      [
        { filePath: "replit.md", lineNumber: 1, command: "pnpm run build" },
        {
          filePath: "replit.md",
          lineNumber: 2,
          command: "pnpm --filter @workspace/api-server run dev",
        },
      ],
      manifests,
    ),
    [],
  );
});

test("reports missing packages and scripts with documentation locations", () => {
  const errors = validateDocumentedCommands(
    [
      {
        filePath: "docs/example.md",
        lineNumber: 4,
        command: "pnpm --filter @workspace/missing run dev",
      },
      {
        filePath: "docs/example.md",
        lineNumber: 8,
        command: "pnpm run missing",
      },
    ],
    [
      {
        filePath: "package.json",
        manifest: { scripts: {} },
      },
    ],
  );

  assert.deepEqual(errors, [
    'docs/example.md:4: "pnpm --filter @workspace/missing run dev" references package "@workspace/missing", but that package was not found.',
    'docs/example.md:8: "pnpm run missing" references script "missing" in "package.json", but that script was not found.',
  ]);
});

test("extracts local Markdown links while ignoring anchors and external URLs", () => {
  const links = extractLocalLinks(
    [
      "[testing guide](testing.md)",
      "[specific section](testing.md#smoke-checks)",
      "[outside](../CONTRIBUTING.md)",
      "[anchor only](#overview)",
      "[website](https://example.test/docs)",
      "[protocol-relative](//example.test/docs)",
    ].join("\n"),
    "docs/ci-validation.md",
  );

  assert.deepEqual(links, [
    {
      filePath: "docs/ci-validation.md",
      lineNumber: 1,
      target: "testing.md",
    },
    {
      filePath: "docs/ci-validation.md",
      lineNumber: 2,
      target: "testing.md#smoke-checks",
    },
    {
      filePath: "docs/ci-validation.md",
      lineNumber: 3,
      target: "../CONTRIBUTING.md",
    },
  ]);
});

test("validates local link existence and repository boundaries", () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const errors = validateLocalLinks(
    [
      {
        filePath: "docs/ci-validation.md",
        lineNumber: 10,
        target: "testing.md",
      },
      {
        filePath: "docs/ci-validation.md",
        lineNumber: 11,
        target: "missing.md#section",
      },
      {
        filePath: "docs/ci-validation.md",
        lineNumber: 12,
        target: "../../outside.md",
      },
    ],
    rootDir,
  );

  assert.deepEqual(errors, [
    'docs/ci-validation.md:11: local link "missing.md#section" resolves to "docs/missing.md", but that path was not found.',
    'docs/ci-validation.md:12: local link "../../outside.md" resolves outside the repository.',
  ]);
});

test("extracts workflow names, workflow.run targets, and pnpm commands", () => {
  const references = extractWorkflowReferences(
    [
      "[[workflows.workflow]]",
      'name = "Project"',
      "",
      "[[workflows.workflow.tasks]]",
      'task = "workflow.run"',
      'args = "ci"',
      "",
      "[[workflows.workflow.tasks]]",
      'task = "shell.exec"',
      'args = "pnpm run verify:ci && pnpm docs:check"',
      "",
      "[deployment]",
      'build = ["pnpm", "run", "verify:deploy"]',
    ].join("\n"),
  );

  assert.deepEqual(references, {
    workflowNames: ["Project"],
    references: [
      {
        kind: "workflow",
        filePath: ".replit",
        lineNumber: 6,
        value: "ci",
      },
      {
        kind: "command",
        filePath: ".replit",
        lineNumber: 10,
        value: "pnpm run verify:ci",
      },
      {
        kind: "command",
        filePath: ".replit",
        lineNumber: 10,
        value: "pnpm docs:check",
      },
      {
        kind: "command",
        filePath: ".replit",
        lineNumber: 13,
        value: "pnpm run verify:deploy",
      },
    ],
  });
});

test("validates workflow references and workflow shell commands", () => {
  const errors = validateWorkflowReferences(
    [
      "[[workflows.workflow]]",
      'name = "Project"',
      "",
      "[[workflows.workflow.tasks]]",
      'task = "workflow.run"',
      'args = "missing-workflow"',
      "",
      "[[workflows.workflow.tasks]]",
      'task = "shell.exec"',
      'args = "pnpm run missing"',
    ].join("\n"),
    [
      {
        filePath: "package.json",
        manifest: { scripts: {} },
      },
    ],
  );

  assert.deepEqual(errors, [
    '.replit:6: workflow "missing-workflow" is referenced by workflow.run, but no workflow with that name is defined.',
    '.replit:10: "pnpm run missing" references script "missing" in "package.json", but that script was not found.',
  ]);
});

test("all currently documented pnpm commands match the repository scripts", () => {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const result = checkDocumentation(repositoryRoot);
  assert.deepEqual(result.errors, []);
  assert.ok(result.commands.length > 0);
});