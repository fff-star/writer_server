import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const statusPattern = /^- Status: (Proposed|Accepted|Superseded)$/m;
const datePattern = /^- Date: \d{4}-\d{2}-\d{2}$/m;
const requiredSections = ["## Context", "## Decision", "## Consequences"];

function statusOf(content) {
  return statusPattern.exec(content)?.[1] ?? undefined;
}

export function validateAdr(path, content) {
  const issues = [];
  const title = /^# ADR (\d{4}): .+$/m.exec(content);
  if (!title) {
    issues.push(`${path}: missing '# ADR NNNN:' title`);
  }
  if (!/^\d{4}-.+\.md$/.test(basename(path))) {
    issues.push(`${path}: ADR filename must start with a four-digit number`);
  }
  if (title && !basename(path).startsWith(`${title[1]}-`)) {
    issues.push(`${path}: filename number does not match the ADR title`);
  }
  if (!statusOf(content)) {
    issues.push(`${path}: missing '- Status: Proposed|Accepted|Superseded'`);
  }
  if (!datePattern.test(content)) {
    issues.push(`${path}: missing '- Date: YYYY-MM-DD'`);
  }
  for (const section of requiredSections) {
    if (!content.includes(`\n${section}\n`)) {
      issues.push(`${path}: missing required section '${section}'`);
    }
  }
  return issues;
}

export function evaluateAdrProtection(changes) {
  const issues = [];
  for (const change of changes) {
    const beforeStatus = statusOf(change.before);
    if (beforeStatus !== "Accepted") {
      continue;
    }
    const afterStatus = statusOf(change.after);
    if (afterStatus === "Superseded") {
      if (!/Superseded by ADR \d{4}/i.test(change.after)) {
        issues.push(`${change.path}: superseded ADR must name the superseding ADR`);
      }
      continue;
    }
    if (change.before !== change.after) {
      issues.push(`${change.path}: Accepted ADRs are immutable; create a superseding ADR instead`);
    }
  }
  return issues;
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function changedAdrFiles(root, base, head) {
  const mergeBase = git(root, ["merge-base", base, head]);
  return git(root, ["diff", "--name-only", `${mergeBase}..${head}`, "--", "docs/adr"])
    .split("\n")
    .filter((file) => /^\d{4}-.+\.md$/.test(basename(file)));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(import.meta.dirname, "..");
  const adrDirectory = resolve(root, "docs/adr");
  const issues = [];
  const files = (await readdir(adrDirectory)).filter((file) => /^\d{4}-.+\.md$/.test(file));
  if (files.length === 0) {
    issues.push("docs/adr: at least one numbered ADR is required");
  }
  for (const file of files) {
    issues.push(
      ...validateAdr(`docs/adr/${file}`, await readFile(resolve(adrDirectory, file), "utf8")),
    );
  }

  const base = process.env.DOCS_ADR_BASE ?? "origin/main";
  const head = process.env.DOCS_ADR_HEAD ?? "HEAD";
  try {
    const mergeBase = git(root, ["merge-base", base, head]);
    const changes = [];
    for (const path of changedAdrFiles(root, base, head)) {
      changes.push({
        path,
        before: git(root, ["show", `${mergeBase}:${path}`]),
        after: await readFile(resolve(root, path), "utf8"),
      });
    }
    issues.push(...evaluateAdrProtection(changes));
  } catch (error) {
    issues.push(`unable to check ADR history against ${base}: ${error.message}`);
  }

  if (issues.length > 0) {
    process.stderr.write(`${issues.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`ADR checks passed for ${files.length} decision records.\n`);
  }
}
