import fs from "node:fs/promises";
import path from "node:path";
import type { Review, TaskRecord } from "./types.js";
import { taskDir } from "./paths.js";

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function createTaskRecord(record: TaskRecord): Promise<void> {
  const dir = taskDir(record.repo_path, record.task.task_id);
  try {
    await fs.access(path.join(dir, "metadata.json"));
    throw new Error(`Task already exists: ${record.task.task_id}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Task already exists:")) throw error;
  }

  await fs.mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, "task.json"), record.task);
  await writeJson(path.join(dir, "metadata.json"), record);
}

export async function saveTaskRecord(record: TaskRecord): Promise<void> {
  record.updated_at = new Date().toISOString();
  await writeJson(path.join(taskDir(record.repo_path, record.task.task_id), "metadata.json"), record);
}

export async function loadTaskRecord(repoPath: string, taskId: string): Promise<TaskRecord> {
  const file = path.join(taskDir(repoPath, taskId), "metadata.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as TaskRecord;
}

export async function savePrompt(repoPath: string, taskId: string, prompt: string): Promise<void> {
  const dir = taskDir(repoPath, taskId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "prompt.md"), prompt, "utf8");
}

export async function appendEvent(repoPath: string, taskId: string, eventLine: string): Promise<void> {
  const dir = taskDir(repoPath, taskId);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(path.join(dir, "events.ndjson"), eventLine.trimEnd() + "\n", "utf8");
}

export async function appendStderr(repoPath: string, taskId: string, text: string): Promise<void> {
  if (!text) return;
  const dir = taskDir(repoPath, taskId);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(path.join(dir, "stderr.log"), text, "utf8");
}

export async function saveWorkerResult(repoPath: string, taskId: string, value: unknown): Promise<void> {
  await writeJson(path.join(taskDir(repoPath, taskId), "result.json"), value);
}

export async function saveDiff(repoPath: string, taskId: string, diff: string): Promise<void> {
  const dir = taskDir(repoPath, taskId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "diff.patch"), diff, "utf8");
}

export async function saveReview(repoPath: string, taskId: string, review: Review): Promise<void> {
  await writeJson(path.join(taskDir(repoPath, taskId), "review.json"), review);
}

export async function readEvents(repoPath: string, taskId: string, tail = 200): Promise<string[]> {
  const file = path.join(taskDir(repoPath, taskId), "events.ndjson");
  try {
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, Math.min(tail, 2000)));
  } catch {
    return [];
  }
}

export async function readWorkerResult(repoPath: string, taskId: string): Promise<unknown | null> {
  const file = path.join(taskDir(repoPath, taskId), "result.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}
