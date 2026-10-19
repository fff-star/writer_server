import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function assertLexicallyInside(workspace: string, candidate: string): void {
  const pathFromWorkspace = relative(workspace, candidate);
  if (
    pathFromWorkspace === "" ||
    (!pathFromWorkspace.startsWith(`..${sep}`) &&
      pathFromWorkspace !== ".." &&
      !isAbsolute(pathFromWorkspace))
  ) {
    return;
  }
  throw new Error(`Path escapes the authorized workspace: ${candidate}`);
}

async function nearestExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`No existing ancestor for ${path}`);
    }
    current = parent;
  }
}

export async function resolveWorkspacePath(
  workspace: string,
  candidate: string,
  options: { allowMissing?: boolean } = {},
): Promise<string> {
  const canonicalWorkspace = await realpath(workspace);
  const absolute = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(canonicalWorkspace, candidate);
  assertLexicallyInside(canonicalWorkspace, absolute);

  try {
    const canonical = await realpath(absolute);
    assertLexicallyInside(canonicalWorkspace, canonical);
    return canonical;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !options.allowMissing) {
      throw error;
    }
  }

  const ancestor = await nearestExistingAncestor(absolute);
  const canonicalAncestor = await realpath(ancestor);
  assertLexicallyInside(canonicalWorkspace, canonicalAncestor);
  const canonical = resolve(canonicalAncestor, relative(ancestor, absolute));
  assertLexicallyInside(canonicalWorkspace, canonical);
  return canonical;
}

export async function createFileNoOverwrite(
  workspace: string,
  candidate: string,
  content: string | Uint8Array,
): Promise<string> {
  const path = await resolveWorkspacePath(workspace, candidate, { allowMissing: true });
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
    0o600,
  );
  try {
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
  return path;
}
