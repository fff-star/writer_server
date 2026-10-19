import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

export type WorkspaceEntry = {
  path: string;
  type: "file" | "directory" | "symlink";
  sha256?: string;
  linkTarget?: string;
};

export type WorkspaceSnapshot = {
  root: string;
  workspaceName: string;
  entries: WorkspaceEntry[];
};

async function hashFile(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function manifest(root: string, current = root): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = [];
  const children = await readdir(current, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    const path = join(current, child.name);
    const displayPath = relative(root, path).split(sep).join("/");
    const info = await lstat(path);
    if (info.isDirectory()) {
      entries.push({ path: displayPath, type: "directory" });
      entries.push(...(await manifest(root, path)));
    } else if (info.isSymbolicLink()) {
      entries.push({ path: displayPath, type: "symlink", linkTarget: await readlink(path) });
    } else if (info.isFile()) {
      entries.push({ path: displayPath, type: "file", sha256: await hashFile(path) });
    } else {
      throw new Error(`Unsupported workspace entry type: ${path}`);
    }
  }
  return entries;
}

export async function createWorkspaceSnapshot(
  workspace: string,
  snapshotParent: string,
): Promise<WorkspaceSnapshot> {
  await mkdir(snapshotParent, { recursive: true });
  const transaction = await mkdtemp(join(snapshotParent, "workspace-snapshot-"));
  const root = join(transaction, "workspace");
  await cp(workspace, root, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    force: false,
    errorOnExist: true,
  });
  return {
    root,
    workspaceName: basename(workspace),
    entries: await manifest(root),
  };
}

export async function restoreWorkspaceSnapshot(
  workspace: string,
  snapshot: WorkspaceSnapshot,
): Promise<void> {
  const backupParent = await mkdtemp(join(dirname(workspace), ".office-agent-rollback-"));
  const backup = join(backupParent, "previous");
  let movedOriginal = false;
  try {
    await rename(workspace, backup);
    movedOriginal = true;
    await cp(snapshot.root, workspace, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      force: false,
      errorOnExist: true,
    });
  } catch (error) {
    if (movedOriginal) {
      await rm(workspace, { recursive: true, force: true });
      await rename(backup, workspace);
    }
    throw error;
  } finally {
    await rm(backupParent, { recursive: true, force: true });
  }
}

export async function snapshotMatchesWorkspace(
  workspace: string,
  snapshot: WorkspaceSnapshot,
): Promise<boolean> {
  const current = await manifest(workspace);
  return JSON.stringify(current) === JSON.stringify(snapshot.entries);
}
