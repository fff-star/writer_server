import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const ignoredWorkflowCommands = new Set(["install", "audit", "exec"]);

export function documentedCommands(markdown) {
  return [...markdown.matchAll(/`pnpm\s+([a-z][a-z0-9:-]*)`/g)].map((match) => match[1]);
}

function collectRunCommands(value, commands = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRunCommands(item, commands));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (key === "run" && typeof item === "string") {
        commands.push(item);
      } else {
        collectRunCommands(item, commands);
      }
    });
  }
  return commands;
}

export function workflowCommands(yamlTexts) {
  const runs = yamlTexts.flatMap((text) => collectRunCommands(parseDocument(text).toJS()));
  return runs.flatMap((run) =>
    [...run.matchAll(/(?:^|\s)pnpm\s+([a-z][a-z0-9:-]*)/g)]
      .map((match) => match[1])
      .filter((command) => !ignoredWorkflowCommands.has(command)),
  );
}

export function findCommandIssues({ scripts, documentation, workflows }) {
  const documented = new Set(documentedCommands(documentation));
  const workflow = new Set(workflowCommands(workflows));
  const issues = [];
  for (const command of documented) {
    if (!scripts.has(command)) {
      issues.push(`documented command does not exist in package.json scripts: ${command}`);
    }
  }
  for (const command of scripts) {
    if (!documented.has(command)) {
      issues.push(`package.json script is not documented: ${command}`);
    }
  }
  for (const command of workflow) {
    if (!scripts.has(command)) {
      issues.push(`CI workflow runs an unknown pnpm script: ${command}`);
    }
    if (!documented.has(command)) {
      issues.push(`CI workflow command is not documented: ${command}`);
    }
  }
  return issues;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(import.meta.dirname, "..");
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const documentation = await readFile(resolve(root, "docs/reference/commands.md"), "utf8");
  const workflowDirectory = resolve(root, ".github/workflows");
  const workflowFiles = (await readdir(workflowDirectory)).filter((name) => /\.ya?ml$/.test(name));
  const workflows = await Promise.all(
    workflowFiles.map((name) => readFile(resolve(workflowDirectory, name), "utf8")),
  );
  const issues = findCommandIssues({
    scripts: new Set(Object.keys(packageJson.scripts ?? {})),
    documentation,
    workflows,
  });
  if (issues.length > 0) {
    process.stderr.write(`${issues.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Command freshness check passed for ${Object.keys(packageJson.scripts ?? {}).length} scripts.\n`,
    );
  }
}
