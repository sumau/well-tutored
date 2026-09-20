import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ignoredDirectories = new Set([
  ".agents",
  ".cache",
  ".git",
  ".local",
  "attached_assets",
  "dist",
  "node_modules",
]);

export type DocumentationCommand = {
  filePath: string;
  lineNumber: number;
  command: string;
};

export type DocumentationLink = {
  filePath: string;
  lineNumber: number;
  target: string;
};

export type PackageManifest = {
  name?: string;
  scripts?: Record<string, string>;
};

export type PackageManifestRecord = {
  filePath: string;
  manifest: PackageManifest;
};

export type DocumentationCheckResult = {
  commands: DocumentationCommand[];
  links: DocumentationLink[];
  errors: string[];
};

function walkFiles(directory: string, fileName?: string): string[] {
  if (!existsSync(directory)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...walkFiles(join(directory, entry.name), fileName));
      continue;
    }
    if (entry.isFile() && (!fileName || entry.name === fileName)) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function documentationFiles(rootDir: string): string[] {
  const files = [
    ...(existsSync(join(rootDir, "replit.md")) ? [join(rootDir, "replit.md")] : []),
    ...walkFiles(join(rootDir, "docs")),
  ];

  return files
    .filter((filePath) => filePath === join(rootDir, "replit.md") || filePath.endsWith(".md"))
    .sort();
}

function extractCommandFromLine(line: string, inCodeFence: boolean): string | undefined {
  const pnpmIndex = line.indexOf("pnpm");
  if (pnpmIndex < 0) return undefined;

  const isInlineCode = line.slice(0, pnpmIndex).includes("`");
  if (!inCodeFence && !isInlineCode) return undefined;

  const command = line
    .slice(pnpmIndex)
    .split("`", 1)[0]
    .split(" —", 1)[0]
    .split(" #", 1)[0]
    .trim()
    .replace(/[.,;:]$/, "");

  return command.startsWith("pnpm ") ? command : undefined;
}

export function extractDocumentedCommands(
  markdown: string,
  filePath: string,
): DocumentationCommand[] {
  const commands: DocumentationCommand[] = [];
  let inCodeFence = false;

  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }

    const command = extractCommandFromLine(line, inCodeFence);
    if (command) {
      commands.push({
        filePath,
        lineNumber: index + 1,
        command,
      });
    }
  }

  return commands;
}

export function extractLocalLinks(
  markdown: string,
  filePath: string,
): DocumentationLink[] {
  const links: DocumentationLink[] = [];
  const linkPattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^)]*)?\)/g;

  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    for (const match of line.matchAll(linkPattern)) {
      const target = match[1];
      if (
        !target ||
        target.startsWith("#") ||
        target.startsWith("//") ||
        /^[a-z][a-z\d+.-]*:/i.test(target)
      ) {
        continue;
      }

      links.push({
        filePath,
        lineNumber: index + 1,
        target,
      });
    }
  }

  return links;
}

export function validateLocalLinks(
  links: DocumentationLink[],
  rootDir: string,
): string[] {
  const errors: string[] = [];

  for (const link of links) {
    const targetPath = link.target.split(/[?#]/, 1)[0];
    if (!targetPath) continue;

    const sourcePath = join(rootDir, link.filePath);
    const resolvedTarget = resolve(dirname(sourcePath), targetPath);
    const relativeTarget = relative(rootDir, resolvedTarget);
    const location = `${link.filePath}:${link.lineNumber}`;

    if (relativeTarget === ".." || relativeTarget.startsWith("../")) {
      errors.push(
        `${location}: local link "${link.target}" resolves outside the repository.`,
      );
      continue;
    }

    if (!existsSync(resolvedTarget)) {
      errors.push(
        `${location}: local link "${link.target}" resolves to "${relativeTarget}", but that path was not found.`,
      );
    }
  }

  return errors;
}

function readPackageManifests(rootDir: string): PackageManifestRecord[] {
  const packagePaths = new Set<string>([
    join(rootDir, "package.json"),
    ...walkFiles(join(rootDir, "artifacts"), "package.json"),
    ...walkFiles(join(rootDir, "lib"), "package.json"),
    ...walkFiles(join(rootDir, "scripts"), "package.json"),
  ]);

  return [...packagePaths]
    .filter((filePath) => existsSync(filePath))
    .sort()
    .map((filePath) => ({
      filePath,
      manifest: JSON.parse(readFileSync(filePath, "utf8")) as PackageManifest,
    }));
}

function packageForFilter(
  filter: string | undefined,
  manifests: PackageManifestRecord[],
): PackageManifestRecord | undefined {
  if (!filter) {
    return manifests.find(
      ({ filePath, manifest }) =>
        filePath === "package.json" ||
        manifest.name === "workspace" ||
        manifest.name === undefined,
    );
  }
  return manifests.find(({ manifest }) => manifest.name === filter);
}

function parseScriptReference(command: string): {
  filter?: string;
  script?: string;
  unsupported?: string;
} {
  const tokens = command.match(/(?:"[^"]*"|'[^']*'|\S+)/g)?.map((token) =>
    token.replace(/^['"]|['"]$/g, ""),
  ) ?? [];

  let index = 1;
  let filter: string | undefined;
  if (tokens[index] === "--filter") {
    filter = tokens[index + 1];
    index += 2;
  } else if (tokens[index]?.startsWith("--filter=")) {
    filter = tokens[index].slice("--filter=".length);
    index += 1;
  }

  if (!tokens[index]) {
    return { filter, unsupported: "no script name" };
  }
  if (tokens[index] === "run") {
    return {
      filter,
      script: tokens[index + 1],
      ...(tokens[index + 1] ? {} : { unsupported: "no script name after run" }),
    };
  }

  if (tokens[index].startsWith("-")) {
    return { filter, unsupported: `unsupported pnpm option "${tokens[index]}"` };
  }

  return { filter, script: tokens[index] };
}

function extractPnpmCommands(shellCommand: string): string[] {
  return shellCommand
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .map((segment) => {
      const pnpmIndex = segment.indexOf("pnpm");
      return pnpmIndex >= 0 ? segment.slice(pnpmIndex).trim() : undefined;
    })
    .filter((command): command is string => Boolean(command));
}

export function validateDocumentedCommands(
  commands: DocumentationCommand[],
  manifests: PackageManifestRecord[],
): string[] {
  const errors: string[] = [];

  for (const documented of commands) {
    const reference = parseScriptReference(documented.command);
    const location = `${documented.filePath}:${documented.lineNumber}`;
    if (reference.unsupported) {
      errors.push(
        `${location}: "${documented.command}" has ${reference.unsupported}.`,
      );
      continue;
    }

    const packageRecord = packageForFilter(reference.filter, manifests);
    if (!packageRecord) {
      errors.push(
        `${location}: "${documented.command}" references package ` +
          `"${reference.filter ?? "the root package"}", but that package was not found.`,
      );
      continue;
    }

    if (!reference.script || !packageRecord.manifest.scripts?.[reference.script]) {
      errors.push(
        `${location}: "${documented.command}" references script ` +
          `"${reference.script ?? "(missing)"}" in ` +
          `"${packageRecord.manifest.name ?? packageRecord.filePath}", but that script was not found.`,
      );
    }
  }

  return errors;
}

export type WorkflowReference = {
  kind: "command" | "workflow";
  filePath: string;
  lineNumber: number;
  value: string;
};

export type WorkflowReferences = {
  workflowNames: string[];
  references: WorkflowReference[];
};

function parseTomlStringArray(value: string): string[] {
  return [...value.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

export function extractWorkflowReferences(
  content: string,
  filePath = ".replit",
): WorkflowReferences {
  const lines = content.split(/\r?\n/);
  const workflowNames: string[] = [];
  const references: WorkflowReference[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nameMatch = line.match(/^\s*name\s*=\s*"([^"]+)"/);
    if (nameMatch) {
      workflowNames.push(nameMatch[1]);
    }

    const taskMatch = line.match(/^\s*task\s*=\s*"([^"]+)"/);
    const argsLine = lines[index + 1];
    const argsMatch = argsLine?.match(/^\s*args\s*=\s*"([^"]+)"/);
    if (taskMatch && argsMatch) {
      if (taskMatch[1] === "workflow.run") {
        references.push({
          kind: "workflow",
          filePath,
          lineNumber: index + 2,
          value: argsMatch[1],
        });
      } else if (taskMatch[1] === "shell.exec") {
        references.push(
          ...extractPnpmCommands(argsMatch[1]).map((command) => ({
            kind: "command" as const,
            filePath,
            lineNumber: index + 2,
            value: command,
          })),
        );
      }
    }

    const buildMatch = line.match(/^\s*build\s*=\s*(\[.*\])\s*$/);
    if (buildMatch) {
      const command = parseTomlStringArray(buildMatch[1]).join(" ");
      if (command.startsWith("pnpm ")) {
        references.push({
          kind: "command",
          filePath,
          lineNumber: index + 1,
          value: command,
        });
      }
    }
  }

  return { workflowNames, references };
}

export function validateWorkflowReferences(
  content: string,
  manifests: PackageManifestRecord[],
  filePath = ".replit",
): string[] {
  const { workflowNames, references } = extractWorkflowReferences(
    content,
    filePath,
  );
  const errors: string[] = [];
  const knownWorkflows = new Set(workflowNames);

  for (const reference of references) {
    if (reference.kind === "workflow") {
      if (!knownWorkflows.has(reference.value)) {
        errors.push(
          `${reference.filePath}:${reference.lineNumber}: workflow "${reference.value}" is referenced by workflow.run, but no workflow with that name is defined.`,
        );
      }
      continue;
    }

    errors.push(
      ...validateDocumentedCommands(
        [
          {
            filePath: reference.filePath,
            lineNumber: reference.lineNumber,
            command: reference.value,
          },
        ],
        manifests,
      ),
    );
  }

  return errors;
}

export function checkDocumentation(rootDir: string): DocumentationCheckResult {
  const files = documentationFiles(rootDir);
  const commands = files.flatMap((filePath) => {
    const relativePath = relative(rootDir, filePath);
    return extractDocumentedCommands(
      readFileSync(filePath, "utf8"),
      relativePath,
    );
  });
  const links = files.flatMap((filePath) => {
    const relativePath = relative(rootDir, filePath);
    return extractLocalLinks(readFileSync(filePath, "utf8"), relativePath);
  });
  const manifests = readPackageManifests(rootDir);
  const replitPath = join(rootDir, ".replit");
  const workflowErrors = existsSync(replitPath)
    ? validateWorkflowReferences(readFileSync(replitPath, "utf8"), manifests)
    : [];

  return {
    commands,
    links,
    errors: [
      ...validateDocumentedCommands(commands, manifests),
      ...validateLocalLinks(links, rootDir),
      ...workflowErrors,
    ],
  };
}

function repositoryRoot(): string {
  return resolve(fileURLToPath(new URL("../..", import.meta.url)));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = checkDocumentation(repositoryRoot());
  if (result.errors.length > 0) {
    console.error("Documentation command check failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Documentation check passed (${result.commands.length} commands and ${result.links.length} local links checked).`,
    );
  }
}