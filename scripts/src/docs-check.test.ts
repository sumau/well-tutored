import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checkDocumentation,
  extractDocumentedCommands,
  validateDocumentedCommands,
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

test("all currently documented pnpm commands match the repository scripts", () => {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const result = checkDocumentation(repositoryRoot);
  assert.deepEqual(result.errors, []);
  assert.ok(result.commands.length > 0);
});