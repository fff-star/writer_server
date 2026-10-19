import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDocument } from "yaml";

const directory = resolve(import.meta.dirname, "../.github/workflows");
const files = (await readdir(directory)).filter((name) => /\.ya?ml$/.test(name)).sort();
if (files.length === 0) {
  throw new Error("No GitHub workflows found");
}
for (const name of files) {
  const document = parseDocument(await readFile(resolve(directory, name), "utf8"), {
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(`${name}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  const workflow = document.toJS();
  if (!workflow.name || !workflow.on || !workflow.jobs || Object.keys(workflow.jobs).length === 0) {
    throw new Error(`${name}: missing name, trigger, or jobs`);
  }
}
process.stdout.write(`Validated ${files.length} GitHub workflow files.\n`);
