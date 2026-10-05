import fs from "node:fs/promises";
import path from "node:path";
import { executable, runProcess } from "./process.js";
import { safeTaskId, worktreeDir } from "./paths.js";

const git = executable("git");

async function gitRun(repoPath: string, args: string[]) {
  const result = await runProcess(git, ["-C", repoPath, ...args]);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export async function assertGitRepository(repoPath: string): Promise<string> {
  const absolute = path.resolve(repoPath);
  const inside = await gitRun(absolute, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") throw new Error(`Not a Git working tree: ${absolute}`);
  return absolute;
}

export async function assertCleanRepository(repoPath: string): Promise<void> {
  const status = await gitRun(repoPath, ["status", "--porcelain"]);
  if (status.trim()) {
    throw new Error(
      "Target repository is dirty. GravityBridge V1 requires a clean working tree so the delegated worktree exactly matches base_sha. Commit or stash changes first.",
    );
  }
}

export async function verifyCommit(repoPath: string, sha: string): Promise<void> {
  await gitRun(repoPath, ["rev-parse", "--verify", `${sha}^{commit}`]);
}

export async function headSha(repoPath: string): Promise<string> {
  return await gitRun(repoPath, ["rev-parse", "HEAD"]);
}

export async function createTaskWorktree(
  repoPath: string,
  taskId: string,
  baseSha: string,
): Promise<{ branchName: string; worktreePath: string }> {
  await verifyCommit(repoPath, baseSha);
  const worktreePath = worktreeDir(repoPath, taskId);
  const branchName = `gb/${safeTaskId(taskId)}`;

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  try {
    await fs.rm(worktreePath, { recursive: true, force: true });
  } catch {
    // Best effort; git will return a useful error if the path remains unusable.
  }

  const branchCheck = await runProcess(git, ["-C", repoPath, "show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
  if (branchCheck.code === 0) {
    throw new Error(`Branch already exists: ${branchName}. Use a new task_id or clean up the previous task explicitly.`);
  }

  const result = await runProcess(git, [
    "-C", repoPath,
    "worktree", "add",
    "-b", branchName,
    worktreePath,
    baseSha,
  ]);

  if (result.code !== 0) {
    throw new Error(`Unable to create worktree: ${result.stderr || result.stdout}`);
  }

  return { branchName, worktreePath };
}

export async function taskDiff(worktreePath: string, baseSha: string): Promise<string> {
  return await gitRun(worktreePath, ["diff", "--no-ext-diff", "--binary", baseSha, "--"]);
}

export async function changedFiles(worktreePath: string, baseSha: string): Promise<string[]> {
  const out = await gitRun(worktreePath, ["diff", "--name-only", baseSha, "--"]);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

export async function worktreeStatus(worktreePath: string): Promise<string> {
  return await gitRun(worktreePath, ["status", "--short"]);
}
