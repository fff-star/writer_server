import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const version = process.argv[2];
const notesPath = process.argv[3];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || !notesPath) {
  throw new Error("Usage: node scripts/check-release.mjs <semver> <notes-output>");
}
const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
if (packageJson.version !== version) {
  throw new Error(`Package version ${packageJson.version} does not match release ${version}`);
}
const changelog = await readFile(resolve(root, "CHANGELOG.md"), "utf8");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heading = new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
const match = heading.exec(changelog);
if (!match || match.index === undefined) {
  throw new Error(`CHANGELOG.md has no dated entry for [${version}]`);
}
const start = match.index + match[0].length;
const next = changelog.indexOf("\n## ", start);
const notes = changelog.slice(start, next === -1 ? undefined : next).trim();
if (!notes) {
  throw new Error(`CHANGELOG.md entry for [${version}] is empty`);
}
await writeFile(resolve(root, notesPath), `${notes}\n`, "utf8");
process.stdout.write(`Release ${version} metadata is valid.\n`);
