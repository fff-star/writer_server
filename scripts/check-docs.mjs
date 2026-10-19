import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "coverage",
  "release",
  "artifacts",
]);
const nonEnglishScript =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u;
const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;

async function collectMarkdown(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdown(path, files);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(path);
    }
  }
  return files;
}

function countEnglishWords(content) {
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let count = 0;
  for (const part of segmenter.segment(content)) {
    if (part.isWordLike) {
      count += 1;
    }
  }
  return count;
}

function linkTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith("<")) {
    const closing = target.indexOf(">");
    if (closing === -1) {
      return null;
    }
    target = target.slice(1, closing);
  } else {
    target = target.split(/\s+(?=["'])[^]*$/)[0] ?? target;
  }
  if (
    !target ||
    target.startsWith("#") ||
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.startsWith("//")
  ) {
    return null;
  }
  return target;
}

function resolveMarkdownLink(sourceFile, rawTarget) {
  const target = linkTarget(rawTarget);
  if (!target) {
    return null;
  }
  const withoutAnchor = target.split("#", 1)[0];
  if (!withoutAnchor) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(withoutAnchor);
  } catch {
    return { path: null, error: `invalid escaped link in ${sourceFile}: ${rawTarget}` };
  }
  let path = resolve(dirname(sourceFile), decoded);
  if (existsSync(path) && extname(path) === "") {
    path = join(path, "README.md");
  }
  return { path, error: null };
}

async function checkFile(file, root) {
  const content = await readFile(file, "utf8");
  const displayPath = relative(root, file).split(sep).join("/");
  const violations = [];
  const words = countEnglishWords(content);
  if (words > 5000) {
    violations.push(`${displayPath}: ${words} words exceeds the 5000-word limit`);
  }
  const scriptMatch = content.match(nonEnglishScript);
  if (scriptMatch) {
    violations.push(`${displayPath}: non-English script detected (${scriptMatch[0]})`);
  }

  const prose = content.replace(/```[\s\S]*?```/g, "");
  const links = [];
  for (const match of prose.matchAll(markdownLink)) {
    const rawTarget = match[1];
    if (!rawTarget) {
      continue;
    }
    const resolved = resolveMarkdownLink(file, rawTarget);
    if (resolved?.error) {
      violations.push(`${displayPath}: ${resolved.error}`);
      continue;
    }
    if (!resolved) {
      continue;
    }
    if (!existsSync(resolved.path)) {
      violations.push(`${displayPath}: broken local link ${rawTarget}`);
      continue;
    }
    if ((await stat(resolved.path)).isFile()) {
      links.push(resolved.path);
    }
  }
  return { violations, links, words };
}

export async function checkDocs({ root }) {
  const files = await collectMarkdown(root);
  const violations = [];
  const links = new Map();
  let totalWords = 0;

  for (const file of files) {
    const result = await checkFile(file, root);
    violations.push(...result.violations);
    links.set(
      resolve(file),
      result.links.map((path) => resolve(path)),
    );
    totalWords += result.words;
  }

  const documentationRoot = resolve(root, "docs");
  const documentationIndex = resolve(documentationRoot, "README.md");
  if (!existsSync(documentationIndex)) {
    violations.push("docs/README.md: documentation index is missing");
  } else {
    const reachable = new Set([documentationIndex]);
    const queue = [documentationIndex];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const target of links.get(current) ?? []) {
        if (
          target.startsWith(`${documentationRoot}${sep}`) &&
          target.endsWith(".md") &&
          !reachable.has(target)
        ) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
    for (const file of files) {
      const resolved = resolve(file);
      if (resolved.startsWith(`${documentationRoot}${sep}`) && !reachable.has(resolved)) {
        violations.push(
          `${relative(root, file).split(sep).join("/")}: orphaned documentation file`,
        );
      }
    }
  }

  return { violations, fileCount: files.length, totalWords };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await checkDocs({ root: resolve(import.meta.dirname, "..") });
  if (result.violations.length > 0) {
    process.stderr.write(`${result.violations.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Documentation checks passed: ${result.fileCount} files, ${result.totalWords} words.\n`,
    );
  }
}
