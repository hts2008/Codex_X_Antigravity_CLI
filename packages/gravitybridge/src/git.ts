import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "./fsutil.js";
import { runProcess } from "./process.js";
import { worktreeDir } from "./paths.js";
import type { ChangedFile } from "./types.js";

// Never let user/global git config (hooks, signing, pagers, external diff) interfere.
const SAFE = ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "core.pager=cat", "-c", "core.quotepath=false"];

export async function gitRun(cwd: string, args: string[], allowFail = false): Promise<string> {
  const result = await runProcess("git", [...SAFE, "-C", cwd, ...args], { timeoutMs: 120_000 });
  if (result.code !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.replace(/\s+$/, "");
}

export async function assertGitRepository(repoPath: string): Promise<string> {
  const absolute = path.resolve(repoPath);
  const top = await gitRun(absolute, ["rev-parse", "--show-toplevel"]);
  return path.resolve(top);
}

export async function assertCleanRepository(repoPath: string): Promise<void> {
  const status = await gitRun(repoPath, ["status", "--porcelain"]);
  if (status.trim()) {
    throw new Error(
      "Target repository has uncommitted changes. Commit or stash them first so the worker starts from exactly the same code Codex sees.",
    );
  }
}

export async function resolveCommit(repoPath: string, ref: string): Promise<string> {
  return await gitRun(repoPath, ["rev-parse", "--verify", `${ref}^{commit}`]);
}

export async function headSha(cwd: string): Promise<string> {
  return await gitRun(cwd, ["rev-parse", "HEAD"]);
}

export async function currentBranch(cwd: string): Promise<string> {
  return await gitRun(cwd, ["rev-parse", "--abbrev-ref", "HEAD"], true);
}

export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const r = await runProcess("git", ["-C", repoPath, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return r.code === 0;
}

/**
 * Create the isolated worktree. Never deletes anything: if the path or branch already exists,
 * it fails loudly so previous work can never be destroyed by a repeated call.
 */
export async function createTaskWorktree(
  repoPath: string,
  taskId: string,
  baseSha: string,
): Promise<{ branchName: string; worktreePath: string }> {
  const worktreePath = worktreeDir(repoPath, taskId);
  const branchName = `gb/${taskId}`;
  if (await exists(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}. Use a new task_id or cleanup_task first.`);
  }
  if (await branchExists(repoPath, branchName)) {
    throw new Error(`Branch already exists: ${branchName}. Use a new task_id or cleanup_task first.`);
  }
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await gitRun(repoPath, ["worktree", "add", "-b", branchName, worktreePath, baseSha]);
  return { branchName, worktreePath };
}

/**
 * Commit everything the worker produced (including NEW files) as one snapshot commit.
 * Returns the new HEAD (unchanged if there was nothing to commit).
 */
export async function snapshotCommit(worktreePath: string, message: string): Promise<string> {
  await gitRun(worktreePath, ["add", "-A", "--", "."]);
  const r = await runProcess("git", [...SAFE, "-C", worktreePath, "diff", "--cached", "--quiet"]);
  if (r.code !== 0) {
    await gitRun(worktreePath, [
      "-c", "user.name=GravityBridge", "-c", "user.email=gravitybridge@localhost",
      "commit", "--no-verify", "--allow-empty-message", "-m", message,
    ]);
  }
  return await headSha(worktreePath);
}

export async function changedFilesBetween(cwd: string, from: string, to: string): Promise<ChangedFile[]> {
  const out = await gitRun(cwd, ["diff", "--name-status", "-z", "-M", from, to, "--"]);
  if (!out) return [];
  const parts = out.split("\0").filter((s) => s.length > 0);
  const files: ChangedFile[] = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i];
    const code = status[0];
    if (code === "R" || code === "C") {
      files.push({ status: code, old_path: parts[i + 1], path: parts[i + 2] });
      i += 2;
    } else {
      files.push({ status: code, path: parts[i + 1] });
      i += 1;
    }
  }
  return files;
}

export async function diffBetween(
  cwd: string,
  from: string,
  to: string,
  mode: "stat" | "full",
  pathFilter?: string,
): Promise<string> {
  const args = mode === "stat"
    ? ["diff", "--stat=200", "--summary", "-M", from, to, "--"]
    : ["diff", "--no-ext-diff", "-M", from, to, "--"];
  if (pathFilter) args.push(pathFilter);
  return await gitRun(cwd, args);
}

export async function removeWorktree(repoPath: string, worktreePath: string, branch: string, deleteBranch: boolean): Promise<string[]> {
  const notes: string[] = [];
  if (await exists(worktreePath)) {
    await gitRun(repoPath, ["worktree", "remove", "--force", worktreePath]);
    notes.push(`removed worktree ${worktreePath}`);
  }
  await gitRun(repoPath, ["worktree", "prune"], true);
  if (deleteBranch && (await branchExists(repoPath, branch))) {
    await gitRun(repoPath, ["branch", "-D", branch]);
    notes.push(`deleted branch ${branch}`);
  }
  return notes;
}
