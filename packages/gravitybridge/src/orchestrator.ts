import path from "node:path";
import { access } from "node:fs/promises";
import { buildInitialPrompt, buildReworkPrompt, buildRetryPrompt } from "./prompt.js";
import { runAntigravityTurn } from "./agy.js";
import {
  assertCleanRepository,
  assertGitRepository,
  changedFiles,
  createTaskWorktree,
  headSha,
  taskDiff,
  worktreeStatus,
} from "./git.js";
import { repoKey, resultSchemaPath } from "./paths.js";
import {
  createTaskRecord,
  loadTaskRecord,
  saveDiff,
  savePrompt,
  saveTaskRecord,
  saveWorkerResult,
} from "./store.js";
import type { TaskContract, TaskRecord, WorkerEnvelope } from "./types.js";

function now(): string {
  return new Date().toISOString();
}

function workerState(envelope: WorkerEnvelope | undefined, exitCode: number): TaskRecord["state"] {
  if (!envelope || exitCode !== 0 || envelope.status !== "SUCCESS") return "WORKER_FAILED";
  const structured = envelope.structured_output as Record<string, unknown> | undefined;
  if (structured?.worker_status === "blocked") return "BLOCKED";
  if (structured?.worker_status === "completed") return "WORKER_COMPLETED";
  return "WORKER_FAILED";
}

async function finalizeWorkerTurn(record: TaskRecord, result: Awaited<ReturnType<typeof runAntigravityTurn>>): Promise<TaskRecord> {
  record.last_worker_envelope = result.envelope;
  record.last_error = result.stderr || result.envelope?.error;
  record.state = workerState(result.envelope, result.exitCode);

  if (result.envelope?.conversation_id) record.conversation_id = result.envelope.conversation_id;

  const diff = await taskDiff(record.worktree_path, record.task.base_sha);
  const files = await changedFiles(record.worktree_path, record.task.base_sha);
  record.changed_files = files;

  await saveDiff(record.repo_path, record.task.task_id, diff);
  await saveWorkerResult(record.repo_path, record.task.task_id, {
    orchestration_state: record.state,
    exit_code: result.exitCode,
    conversation_id: record.conversation_id,
    worker_envelope: result.envelope ?? null,
    changed_files: files,
    worktree_status: await worktreeStatus(record.worktree_path),
    stderr: result.stderr || null,
  });

  await saveTaskRecord(record);
  return record;
}

export async function delegateAndWait(repoPathInput: string, task: TaskContract): Promise<TaskRecord> {
  await access(resultSchemaPath);
  const repoPath = await assertGitRepository(path.resolve(repoPathInput));
  await assertCleanRepository(repoPath);

  const currentHead = await headSha(repoPath);
  if (currentHead !== task.base_sha && !currentHead.startsWith(task.base_sha) && !task.base_sha.startsWith(currentHead)) {
    throw new Error(
      `Task base_sha (${task.base_sha}) does not match target repository HEAD (${currentHead}). V1 requires an explicit current clean base.`,
    );
  }

  const { branchName, worktreePath } = await createTaskWorktree(repoPath, task.task_id, task.base_sha);

  const record: TaskRecord = {
    schema_version: "1.0",
    repo_path: repoPath,
    repo_key: repoKey(repoPath),
    task,
    state: "CREATED",
    branch_name: branchName,
    worktree_path: worktreePath,
    retries: 0,
    rework_cycles: 0,
    created_at: now(),
    updated_at: now(),
  };

  await createTaskRecord(record);
  record.state = "DISPATCHED";
  await saveTaskRecord(record);

  const prompt = buildInitialPrompt(task);
  await savePrompt(repoPath, task.task_id, prompt);

  record.state = "RUNNING";
  await saveTaskRecord(record);

  try {
    const result = await runAntigravityTurn({
      repoPath,
      task,
      worktreePath,
      prompt,
    });
    return await finalizeWorkerTurn(record, result);
  } catch (error) {
    record.state = "WORKER_FAILED";
    record.last_error = error instanceof Error ? error.message : String(error);
    await saveTaskRecord(record);
    return record;
  }
}

export async function continueTask(repoPathInput: string, taskId: string, feedback: string): Promise<TaskRecord> {
  const repoPath = await assertGitRepository(path.resolve(repoPathInput));
  const record = await loadTaskRecord(repoPath, taskId);

  if (!["CHANGES_REQUESTED", "BLOCKED", "WORKER_COMPLETED"].includes(record.state)) {
    throw new Error(`Task ${taskId} cannot continue from state ${record.state}.`);
  }

  if (!record.conversation_id) {
    throw new Error(`Task ${taskId} has no Antigravity conversation_id to resume.`);
  }

  if (record.rework_cycles >= record.task.limits.max_rework_cycles) {
    throw new Error(`Task ${taskId} exhausted max_rework_cycles=${record.task.limits.max_rework_cycles}.`);
  }

  record.rework_cycles += 1;
  record.state = "RUNNING";
  await saveTaskRecord(record);

  const prompt = buildReworkPrompt(record.task, feedback, record.rework_cycles);
  await savePrompt(repoPath, taskId, prompt);

  try {
    const result = await runAntigravityTurn({
      repoPath,
      task: record.task,
      worktreePath: record.worktree_path,
      prompt,
      conversationId: record.conversation_id,
    });
    return await finalizeWorkerTurn(record, result);
  } catch (error) {
    record.state = "WORKER_FAILED";
    record.last_error = error instanceof Error ? error.message : String(error);
    await saveTaskRecord(record);
    return record;
  }
}

export async function retryTask(repoPathInput: string, taskId: string): Promise<TaskRecord> {
  const repoPath = await assertGitRepository(path.resolve(repoPathInput));
  const record = await loadTaskRecord(repoPath, taskId);

  if (record.state !== "WORKER_FAILED") {
    throw new Error(`Task ${taskId} cannot be retried from state ${record.state}.`);
  }

  if (record.retries >= record.task.limits.max_retries) {
    throw new Error(`Task ${taskId} exhausted max_retries=${record.task.limits.max_retries}.`);
  }

  record.retries += 1;
  record.state = "RUNNING";
  await saveTaskRecord(record);

  const prompt = buildRetryPrompt(record.task, record.last_error, record.retries);
  await savePrompt(repoPath, taskId, prompt);

  try {
    const result = await runAntigravityTurn({
      repoPath,
      task: record.task,
      worktreePath: record.worktree_path,
      prompt,
      conversationId: record.conversation_id,
    });
    return await finalizeWorkerTurn(record, result);
  } catch (error) {
    record.state = "WORKER_FAILED";
    record.last_error = error instanceof Error ? error.message : String(error);
    await saveTaskRecord(record);
    return record;
  }
}
