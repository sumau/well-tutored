import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checkDocumentation,
  extractDocumentedCommands,
  extractLocalLinks,
  extractWorkflowCommands,
  validateDocumentedCommands,
  validateLocalLinks,
  validateWorkflowCommands,
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
        { filePath: "PROJECT.md", lineNumber: 1, command: "pnpm run build" },
        {
          filePath: "PROJECT.md",
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

test("extracts pnpm commands from inline and block run steps", () => {
  const commands = extractWorkflowCommands(
    [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - name: Install dependencies",
      "        run: pnpm install --frozen-lockfile",
      "      - name: Verify",
      "        run: pnpm run verify:ci && pnpm docs:check",
      "      - name: Smoke",
      "        run: |",
      "          echo checking",
      "          pnpm run smoke:launch:incomplete",
      "      - name: Deploy",
      "        run: flyctl deploy --remote-only",
    ].join("\n"),
    ".github/workflows/ci.yml",
  );

  // `pnpm install` names no script, and neither does a non-pnpm step.
  assert.deepEqual(commands, [
    {
      filePath: ".github/workflows/ci.yml",
      lineNumber: 8,
      command: "pnpm run verify:ci",
    },
    {
      filePath: ".github/workflows/ci.yml",
      lineNumber: 8,
      command: "pnpm docs:check",
    },
    {
      filePath: ".github/workflows/ci.yml",
      lineNumber: 12,
      command: "pnpm run smoke:launch:incomplete",
    },
  ]);
});

test("validates the pnpm scripts a workflow runs", () => {
  const errors = validateWorkflowCommands(
    [
      "jobs:",
      "  deploy:",
      "    steps:",
      "      - name: Launch smoke",
      "        run: pnpm run missing",
    ].join("\n"),
    [
      {
        filePath: "package.json",
        manifest: { scripts: {} },
      },
    ],
    ".github/workflows/ci.yml",
  );

  assert.deepEqual(errors, [
    '.github/workflows/ci.yml:5: "pnpm run missing" references script "missing" in "package.json", but that script was not found.',
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