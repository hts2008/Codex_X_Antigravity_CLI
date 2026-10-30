import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TaskIdSchema } from "./types.js";

const moduleFile = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(moduleFile);

/** True when running from TypeScript sources (tests / tsx dev mode). */
export const runningFromSource = moduleFile.endsWith(".ts");

export const repoRoot = process.env.GRAVITYBRIDGE_ROOT
  ? path.resolve(process.env.GRAVITYBRIDGE_ROOT)
  : path.resolve(moduleDir, "../../..");

export function gravityHome(): string {
  return process.env.GRAVITYBRIDGE_HOME
    ? path.resolve(process.env.GRAVITYBRIDGE_HOME)
    : path.join(os.homedir(), ".gravitybridge");
}

export const resultSchemaPath = path.join(repoRoot, "schemas", "result.schema.json");

/** Absolute path of a sibling module (works for both dist/*.js and src/*.ts). */
export function siblingModule(name: string): string {
  return path.join(moduleDir, `${name}${runningFromSource ? ".ts" : ".js"}`);
}

/** Canonical absolute path: resolves symlinks and Windows 8.3 short names (C:\\Users\\RUNNER~1 -> long name). */
export function canonicalPath(p: string): string {
  const resolved = path.resolve(p);
  // Canonicalise the deepest existing ancestor so not-yet-created files work too.
  let base = resolved;
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(base), ...rest);
    } catch {
      const parent = path.dirname(base);
      if (parent === base) return resolved;
      rest.unshift(path.basename(base));
      base = parent;
    }
  }
}

export function normalizeRepoPath(repoPath: string): string {
  const canonical = canonicalPath(repoPath);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function repoKey(repoPath: string): string {
  return crypto.createHash("sha256").update(normalizeRepoPath(repoPath)).digest("hex").slice(0, 16);
}

export function assertTaskId(taskId: string): string {
  const parsed = TaskIdSchema.safeParse(taskId);
  if (!parsed.success) throw new Error(`Invalid task_id: ${JSON.stringify(taskId)}`);
  return parsed.data;
}

export function tasksRoot(): string {
  return path.join(gravityHome(), "tasks");
}

export function worktreesRoot(): string {
  return path.join(gravityHome(), "worktrees");
}

export function taskDirByKey(key: string, taskId: string): string {
  return path.join(tasksRoot(), key, assertTaskId(taskId));
}

export function taskDir(repoPath: string, taskId: string): string {
  return taskDirByKey(repoKey(repoPath), taskId);
}

export function worktreeDir(repoPath: string, taskId: string): string {
  return path.join(worktreesRoot(), repoKey(repoPath), assertTaskId(taskId));
}

/**
 * If `p` lies inside a GravityBridge worktree, return its repo key, task id and worktree root.
 * Used by the Antigravity hook to discover which task contract applies.
 */
export function locateWorktree(p: string): { key: string; taskId: string; worktree: string } | null {
  const root = canonicalPath(worktreesRoot());
  const target = canonicalPath(p);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [key, taskId] = rel.split(path.sep);
  if (!key || !taskId || !TaskIdSchema.safeParse(taskId).success) return null;
  return { key, taskId, worktree: path.join(root, key, taskId) };
}

export function parseDuration(value: string): number {
  const m = /^([0-9]+)([smh])$/.exec(value);
  if (!m) throw new Error(`Invalid duration: ${value}`);
  const n = Number(m[1]);
  return n * (m[2] === "s" ? 1_000 : m[2] === "m" ? 60_000 : 3_600_000);
}
