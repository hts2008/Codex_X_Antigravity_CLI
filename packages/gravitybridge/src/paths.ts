import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot =
  process.env.GRAVITYBRIDGE_ROOT
    ? path.resolve(process.env.GRAVITYBRIDGE_ROOT)
    : path.resolve(moduleDir, "../../..");

export const gravityHome =
  process.env.GRAVITYBRIDGE_HOME
    ? path.resolve(process.env.GRAVITYBRIDGE_HOME)
    : path.join(os.homedir(), ".gravitybridge");

export const resultSchemaPath = path.join(repoRoot, "schemas", "result.schema.json");

export function repoKey(repoPath: string): string {
  return crypto.createHash("sha256").update(path.resolve(repoPath)).digest("hex").slice(0, 16);
}

export function safeTaskId(taskId: string): string {
  return taskId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 96);
}

export function taskDir(repoPath: string, taskId: string): string {
  return path.join(gravityHome, "tasks", repoKey(repoPath), safeTaskId(taskId));
}

export function worktreeDir(repoPath: string, taskId: string): string {
  return path.join(gravityHome, "worktrees", repoKey(repoPath), safeTaskId(taskId));
}
