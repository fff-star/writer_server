import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const explicitExemptions = [];

const bypassPattern = /^\s*docs-impact\s*:\s*none\s*$/im;
const codePatterns = [
  /^apps\//,
  /^packages\//,
  /^native\//,
  /^scripts\//,
  /^\.github\/workflows\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
];

function isCodePath(path) {
  return codePatterns.some((pattern) => pattern.test(path));
}

function isDocumentationPath(path) {
  return (
    path === "README.md" ||
    path === "CHANGELOG.md" ||
    path === "SECURITY.md" ||
    path.startsWith("docs/")
  );
}

function isExempt(path) {
  return explicitExemptions.some((exemption) => path.startsWith(exemption.path));
}

const specializedRules = [
  {
    name: "security documentation",
    matches: (path) =>
      path.startsWith("packages/security/") || path.startsWith("native/windows-sandbox/"),
    documentation: (path) => path === "SECURITY.md" || path.startsWith("docs/adr/"),
    message: "security changes must update SECURITY.md or an architecture decision record",
  },
  {
    name: "library documentation",
    matches: (path) =>
      path.startsWith("packages/library/") ||
      path.startsWith("packages/ingestion/") ||
      path === "apps/desktop/src/main/library-service.ts" ||
      path === "apps/desktop/src/renderer/src/LibraryPanel.tsx",
    documentation: (path) =>
      path === "docs/reference/library-formats.md" || path.startsWith("docs/adr/"),
    message:
      "managed-library changes must update docs/reference/library-formats.md or an architecture decision record",
  },
  {
    name: "research documentation",
    matches: (path) =>
      path.startsWith("packages/research/") || path === "apps/desktop/src/main/evidence-service.ts",
    documentation: (path) =>
      path === "docs/reference/research-providers.md" || path.startsWith("docs/adr/"),
    message:
      "research changes must update docs/reference/research-providers.md or an architecture decision record",
  },
  {
    name: "automation documentation",
    matches: (path) =>
      path.startsWith(".github/workflows/") ||
      path === "package.json" ||
      path === "pnpm-workspace.yaml",
    documentation: (path) =>
      path === "docs/how-to/repository-automation.md" ||
      path === "docs/reference/commands.md" ||
      path.startsWith("docs/adr/"),
    message:
      "automation changes must update repository automation or command documentation, or add an ADR",
  },
];

export function evaluateDocsImpact({ files, note = "" }) {
  const relevantFiles = files.filter((file) => !isExempt(file));
  const codeFiles = relevantFiles.filter(isCodePath);
  if (codeFiles.length === 0) {
    return [];
  }
  if (bypassPattern.test(note)) {
    return [];
  }

  const violations = [];
  if (!relevantFiles.some(isDocumentationPath)) {
    violations.push(
      `code changes require a documentation update (README.md, CHANGELOG.md, docs/**, or a new ADR): ${codeFiles.join(", ")}`,
    );
  }
  for (const rule of specializedRules) {
    const changed = relevantFiles.filter(rule.matches);
    if (changed.length > 0 && !relevantFiles.some(rule.documentation)) {
      violations.push(`${rule.message}: ${changed.join(", ")}`);
    }
  }
  return violations;
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export function changedFiles(root, base, head) {
  const mergeBase = git(root, ["merge-base", base, head]);
  if (!mergeBase) {
    throw new Error(`Unable to find a merge base for ${base} and ${head}`);
  }
  const committed = git(root, ["diff", "--name-only", `${mergeBase}..${head}`])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  const trackedWorktree = git(root, ["diff", "--name-only", head])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  return [...new Set([...committed, ...trackedWorktree, ...untracked])].sort();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(import.meta.dirname, "..");
  const base = process.env.DOCS_IMPACT_BASE ?? "origin/main";
  const head = process.env.DOCS_IMPACT_HEAD ?? "HEAD";
  const files = changedFiles(root, base, head);
  const note = process.env.DOCS_IMPACT_NOTE ?? git(root, ["log", "-1", "--pretty=%B", head]);
  const violations = evaluateDocsImpact({ files, note });
  if (violations.length > 0) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Documentation impact check passed for ${files.length} changed files.\n`);
  }
}
