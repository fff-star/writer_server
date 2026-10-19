import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { resolve } from "node:path";

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.endsWith("-unpacked")) {
        result.push(...(await files(path)));
      }
    } else if (
      entry.isFile() &&
      entry.name !== "SHA256SUMS" &&
      /\.(AppImage|deb|exe|msi|zip|dmg|pkg|blockmap|run)$/i.test(entry.name)
    ) {
      result.push(path);
    }
  }
  return result;
}

const directory = resolve(process.argv[2] ?? "release");
const paths = (await files(directory)).sort();
if (paths.length === 0) {
  throw new Error(`No artifacts found in ${directory}`);
}
const lines = [];
for (const path of paths) {
  const hash = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  lines.push(`${hash}  ${relative(directory, path).split(sep).join("/")}`);
}
await writeFile(join(directory, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`Wrote ${lines.length} artifact checksums.\n`);
