import fs from "node:fs/promises";
import path from "node:path";
import { readJson, tail, writeJsonAtomic, writeTextAtomic } from "./fsutil.js";
import { taskDir, taskDirByKey, tasksRoot, repoKey } from "./paths.js";
import type { TaskRecord, TurnSummary } from "./types.js";

export const MAX_EVENTS_BYTES = 20 * 1024 * 1024;

export function recordFile(repoPath: string, taskId: string): string {
  return path.join(taskDir(repoPath, taskId), "metadata.json");
}

/** Atomically claim a task directory. Fails if the task id was already used for this repo. */
export async function claimTaskDir(repoPath: string, taskId: string): Promise<string> {
  const dir = taskDir(repoPath, taskId);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  try {
    await fs.mkdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Task already exists: ${taskId}. Use a new task_id (or continue/retry the existing one).`);
    }
    throw error;
  }
  return dir;
}

export async function saveTaskRecord(record: TaskRecord): Promise<void> {
  record.updated_at = new Date().toISOString();
  await writeJsonAtomic(recordFile(record.repo_path, record.task.task_id), record);
}

export async function loadTaskRecord(repoPath: string, taskId: string): Promise<TaskRecord> {
  const record = await readJson<TaskRecord>(recordFile(repoPath, taskId));
  if (!record) throw new Error(`Task not found: ${taskId} (repo ${repoPath}).`);
  return record;
}

export async function loadTaskRecordByKey(key: string, taskId: string): Promise<TaskRecord | null> {
  return await readJson<TaskRecord>(path.join(taskDirByKey(key, taskId), "metadata.json"));
}

export async function listTaskRecords(repoPath?: string): Promise<TaskRecord[]> {
  const keys = repoPath ? [repoKey(repoPath)] : await safeReaddir(tasksRoot());
  const out: TaskRecord[] = [];
  for (const key of keys) {
    for (const id of await safeReaddir(path.join(tasksRoot(), key))) {
      try {
        const r = await loadTaskRecordByKey(key, id);
        if (r) out.push(r);
      } catch { /* skip unreadable */ }
    }
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

export async function writeTaskFile(repoPath: string, taskId: string, name: string, content: string | object): Promise<void> {
  const file = path.join(taskDir(repoPath, taskId), name);
  if (typeof content === "string") await writeTextAtomic(file, content);
  else await writeJsonAtomic(file, content);
}

export async function readTaskText(repoPath: string, taskId: string, name: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(taskDir(repoPath, taskId), name), "utf8");
  } catch {
    return null;
  }
}

export async function saveTurn(repoPath: string, taskId: string, turn: TurnSummary): Promise<void> {
  await writeJsonAtomic(path.join(taskDir(repoPath, taskId), "turns", `${turn.turn}.json`), turn);
  await writeJsonAtomic(path.join(taskDir(repoPath, taskId), "result.json"), turn);
}

export async function loadTurn(repoPath: string, taskId: string, turn?: number): Promise<TurnSummary | null> {
  const name = turn ? path.join("turns", `${turn}.json`) : "result.json";
  return await readJson<TurnSummary>(path.join(taskDir(repoPath, taskId), name));
}

/** Event appender with a hard size cap so a chatty worker cannot fill the disk. */
export class EventLog {
  private written = 0;
  private capped = false;
  constructor(private readonly file: string) {}

  async append(line: string): Promise<void> {
    if (this.capped) return;
    const data = line.trimEnd() + "\n";
    if (this.written + data.length > MAX_EVENTS_BYTES) {
      this.capped = true;
      await fs.appendFile(this.file, JSON.stringify({ event: "gravitybridge_log_capped" }) + "\n", "utf8");
      return;
    }
    this.written += data.length;
    await fs.appendFile(this.file, data, "utf8");
  }
}

export async function readEvents(repoPath: string, taskId: string, count: number, maxBytes: number): Promise<string[]> {
  const raw = await readTaskText(repoPath, taskId, "events.ndjson");
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, Math.min(count, 500)));
  const out: string[] = [];
  let size = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = tail(lines[i], 4_000);
    size += l.length;
    if (size > maxBytes) break;
    out.unshift(l);
  }
  return out;
}

/** Runner liveness file. */
export interface RunInfo { pid: number; turn: number; started_at: string }

export function runFile(repoPath: string, taskId: string): string {
  return path.join(taskDir(repoPath, taskId), "run.json");
}

export function cancelFile(repoPath: string, taskId: string): string {
  return path.join(taskDir(repoPath, taskId), "cancel.request");
}
