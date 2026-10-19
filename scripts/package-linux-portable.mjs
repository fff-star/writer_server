import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const release = resolve(root, "release");
const unpacked = resolve(release, "linux-unpacked");
const executable = resolve(unpacked, "office-agent");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

if (!existsSync(executable)) {
  throw new Error("Missing release/linux-unpacked/office-agent. Run `pnpm package` first.");
}

const temporary = await mkdtemp(join(tmpdir(), "office-agent-portable-"));
const archive = join(temporary, "payload.tar.gz");
try {
  const tar = spawnSync("tar", ["-czf", archive, "-C", release, "linux-unpacked"], {
    stdio: "inherit",
  });
  if (tar.status !== 0) {
    throw new Error(`tar exited with status ${tar.status}`);
  }

  const marker = "__OFFICE_AGENT_ARCHIVE_BELOW__";
  const header = `#!/bin/sh
set -eu
ARCHIVE_MARKER='${marker}'
PORTABLE_VERSION='${packageJson.version}'
line=$(awk -v marker="$ARCHIVE_MARKER" '$0 == marker { print NR + 1; exit }' "$0")
if [ -z "$line" ]; then
  printf '%s\\n' 'Portable archive marker is missing.' >&2
  exit 70
fi
cache="\${XDG_CACHE_HOME:-$HOME/.cache}/office-agent/$PORTABLE_VERSION"
complete="$cache/.complete"
if [ ! -f "$complete" ]; then
  parent=$(dirname "$cache")
  temp="$parent/.office-agent-extract.$$"
  mkdir -p "$parent"
  rm -rf "$temp"
  mkdir "$temp"
  trap 'rm -rf "$temp"' EXIT HUP INT TERM
  if ! tail -n +"$line" "$0" | tar -xzf - -C "$temp"; then
    printf '%s\\n' 'Portable archive extraction failed.' >&2
    exit 70
  fi
  rm -rf "$cache"
  mv "$temp" "$cache"
  touch "$complete"
  trap - EXIT HUP INT TERM
fi
exec "$cache/linux-unpacked/office-agent" "$@"
${marker}
`;

  const target = join(release, `office-agent-${packageJson.version}-linux-portable.run`);
  await writeFile(target, Buffer.concat([Buffer.from(header), await readFile(archive)]));
  await chmod(target, 0o755);
  process.stdout.write(`Wrote portable Linux executable: ${target}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
