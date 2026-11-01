/**
 * Task lifecycle used by the MCP tools. Every call returns quickly:
 * the actual Antigravity turn runs in a detached runner process (runner.ts).
 */
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exists, head, readJson, tail, writeJsonAtomic } from "./fsutil.js";
import {
  assertCleanRepository, assertGitRepository, branchExists, changedFilesBetween, createTaskWorktree, diffBetween,
  headSha, removeWorktree, resolveCommit,
} from "./git.js";
import { parseDuration, runningFromSource, siblingModule, taskDir } from "./paths.js";
import { lintContract } from "./lint.js";
import { buildPrompt, type PromptExtras } from "./prompt.js";
import { isAlive, killTree } from "./process.js";
import { assertTransition, failureSignature, nextActionHint, TERMINAL_STATES } from "./state.js";
import {
  cancelFile, claimTaskDir, listTaskRecords, loadTaskRecord, loadTurn, readEvents, readTaskText, runFile,
  saveTaskRecord, writeTaskFile, type RunInfo,
} from "./store.js";
import {
  ReviewSchema, TaskContractSchema, tokenLimits, type Review, type TaskRecord, type TaskState, type TurnKind, type TurnSummary,
} from "./types.js";
import { budgetLine, fmtTokens, usageLine, type TokenUsage } from "./usage.js";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STARTUP_GRACE_MS = 60_000;

export function maxParallel(): number {
  const n = Number(process.env.GRAVITYBRIDGE_MAX_PARALLEL ?? 2);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

// ---------------------------------------------------------------------------
// In-process lock: serialises tool calls that touch the same task.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  const chained = prev.then(() => mine);
  locks.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

export async function resolveRepo(repoPath: string): Promise<string> {
  return await assertGitRepository(path.resolve(repoPath));
}

// ---------------------------------------------------------------------------
// Compact summary returned by most tools (kept small to save Codex context).

const EXPLORE_TOOLS = /^(view_file|view_code_item|view_file_outline|read_file|list_dir|find_by_name|grep_search|codebase_search|search)/;

function nonEmpty<T>(a: T[]): T[] | undefined {
  return a.length ? a : undefined;
}

function topTools(counts?: Record<string, number>): string | undefined {
  if (!counts) return undefined;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return top.length ? top.map(([k, v]) => `${k} ${v}`).join(", ") : undefined;
}

/** Plain-language hints that tell Codex how to make the next contract cheaper. */
export function efficiencyWarnings(record: TaskRecord, latest?: TurnSummary | null): string[] {
  const w: string[] = [];
  const l = tokenLimits(record.task);
  const total = record.usage_total?.total_tokens ?? 0;
  if (latest?.budget_stop) w.push(`Turn ${latest.turn} was stopped by a budget: ${latest.budget_stop}.`);
  if (l.max_task_tokens && total >= l.max_task_tokens * 0.6) {
    w.push(`Task used ${budgetLine(total, l.max_task_tokens)} of its token budget. Prefer TAKEOVER for small remaining fixes.`);
  }
  const files = Math.max(1, record.changed_files.length);
  if (total >= 800_000 && total / files >= 300_000) {
    w.push(`High cost for the size of the change: ${fmtTokens(total)} tokens for ${record.changed_files.length} changed file(s). Give exact context files/sections and plain-language goals.`);
  }
  if (latest?.tool_counts) {
    const explore = Object.entries(latest.tool_counts).filter(([k]) => EXPLORE_TOOLS.test(k)).reduce((n, [, v]) => n + v, 0);
    if (explore >= 60) w.push(`Worker made ${explore} read/search calls in turn ${latest.turn}: it had to explore. List the files and symbols to read in context.`);
    const cmds = latest.tool_counts.run_command ?? 0;
    if (cmds >= 25) w.push(`Worker ran ${cmds} commands in turn ${latest.turn}: use targeted, quiet validation commands.`);
  }
  if (record.rework_cycles >= 2) {
    w.push(`${record.rework_cycles} rework cycles: each one replays the whole conversation. Make acceptance criteria checkable up front; fix tiny findings yourself.`);
  }
  return w;
}

export function summarize(record: TaskRecord, latest?: TurnSummary | null, extra: Record<string, unknown> = {}) {
  const t = record.task;
  const wr = latest?.worker_result;
  const failedValidation = (latest?.bridge_validation ?? []).filter((c) => c.exit_code !== 0);
  return {
    task_id: t.task_id,
    state: record.state,
    next_action: nextActionHint(record.state),
    turn: record.turns.length + (record.active_run ? 1 : 0),
    branch: record.branch_name,
    worktree: record.worktree_path,
    base_sha: t.base_sha,
    conversation_id: record.conversation_id,
    budgets: {
      retries: `${record.retries}/${t.limits.max_retries}`,
      rework_cycles: `${record.rework_cycles}/${t.limits.max_rework_cycles}`,
      blocker_answers: `${record.blocker_answers}/${t.limits.max_blocker_answers}`,
      same_failure_count: record.same_failure_count,
      task_tokens: budgetLine(record.usage_total?.total_tokens ?? 0, tokenLimits(t).max_task_tokens),
    },
    usage: record.usage_total || latest?.usage
      ? {
          task_total: usageLine(record.usage_total),
          latest_turn: usageLine(latest?.usage),
          latest_turn_tool_calls: latest?.tool_steps,
          latest_turn_top_tools: topTools(latest?.tool_counts),
        }
      : undefined,
    efficiency_warnings: nonEmpty(efficiencyWarnings(record, latest)),
    changed_files: record.changed_files.slice(0, 200).map((f) => `${f.status} ${f.old_path ? `${f.old_path} -> ` : ""}${f.path}`),
    scope_violations: record.scope_violations,
    last_error: record.last_error ? head(record.last_error, 1_500) : undefined,
    latest_turn: latest
      ? {
          turn: latest.turn,
          kind: latest.kind,
          outcome: latest.outcome,
          worker_status: wr?.worker_status,
          summary: wr ? head(wr.summary, 2_000) : undefined,
          blockers: wr?.blockers.length ? wr.blockers : undefined,
          known_issues: wr?.known_issues.length ? wr.known_issues.slice(0, 20) : undefined,
          worker_validation_claims: wr?.validation,
          claim_mismatches: latest.claim_mismatches?.length ? latest.claim_mismatches : undefined,
          git_violations: latest.git_violations?.length ? latest.git_violations : undefined,
          permission_notices: latest.permission_notices?.length ? latest.permission_notices.slice(0, 10) : undefined,
          tool_errors: latest.tool_errors?.length ? latest.tool_errors.slice(0, 10) : undefined,
          setup_failed: latest.setup?.filter((c) => c.exit_code !== 0).map((c) => ({ ...c, output_tail: tail(c.output_tail, 1_500) })),
          bridge_validation: latest.bridge_validation?.map((c) => ({
            command: c.command,
            exit_code: c.exit_code,
            timed_out: c.timed_out || undefined,
            output_tail: c.exit_code !== 0 ? tail(c.output_tail, 1_500) : undefined,
          })),
          bridge_validation_passed: latest.bridge_validation ? failedValidation.length === 0 : undefined,
        }
      : undefined,
    ...extra,
  };
}

async function latestTurn(record: TaskRecord): Promise<TurnSummary | null> {
  const last = record.turns.at(-1);
  return last ? await loadTurn(record.repo_path, record.task.task_id, last.turn) : null;
}

// ---------------------------------------------------------------------------
// Reconciliation: detect runners that died without finalising (crash, reboot, kill).

export async function reconcile(record: TaskRecord): Promise<TaskRecord> {
  if (record.state !== "RUNNING") return record;
  const id = record.task.task_id;
  const run = await readJson<RunInfo & { agy_pid?: number }>(runFile(record.repo_path, id));
  const startedAt = Date.parse(record.active_run?.started_at ?? record.updated_at);
  const now = Date.now();
  if (run && isAlive(run.pid)) {
    const deadline = Date.parse(record.active_run?.deadline_at ?? "");
    if (!Number.isFinite(deadline) || now <= deadline) return record;
    if (run.agy_pid) killTree(run.agy_pid);
    killTree(run.pid);
    return await markOrphan(record, "Turn exceeded its hard deadline; runner and worker were killed by GravityBridge.");
  }
  if (!run && now - startedAt < STARTUP_GRACE_MS) return record; // runner still starting
  // The runner saves the record before deleting run.json, so re-read before declaring an orphan.
  const fresh = await loadTaskRecord(record.repo_path, id);
  if (fresh.state !== "RUNNING") return fresh;
  if (run?.agy_pid && isAlive(run.agy_pid)) killTree(run.agy_pid);
  const log = tail((await readTaskText(record.repo_path, id, "runner.log")) ?? "", 800);
  return await markOrphan(fresh, `Runner process ended without finalising the turn (crash, reboot or killed).${log ? ` runner.log: ${log}` : ""}`);
}

async function markOrphan(record: TaskRecord, error: string): Promise<TaskRecord> {
  const id = record.task.task_id;
  const canceled = await exists(cancelFile(record.repo_path, id));
  const outcome: TaskState = canceled ? "CANCELED" : "WORKER_FAILED";
  const finalError = canceled ? "Canceled by Codex (cancel_task)." : error;
  if (record.active_run) {
    record.turns.push({
      turn: record.active_run.turn, kind: record.active_run.kind, started_at: record.active_run.started_at,
      finished_at: new Date().toISOString(), outcome, error: head(finalError, 500),
    });
  }
  // Refresh evidence so Codex sees what the worker left behind (uncommitted changes stay in the worktree).
  try {
    record.changed_files = await changedFilesBetween(record.worktree_path, record.task.base_sha, "HEAD");
  } catch { /* worktree may be gone */ }
  record.state = outcome;
  record.last_error = finalError;
  if (outcome === "WORKER_FAILED") {
    const sig = failureSignature(finalError);
    record.same_failure_count = sig === record.last_failure_signature ? record.same_failure_count + 1 : 1;
    record.last_failure_signature = sig;
  }
  record.active_run = undefined;
  await saveTaskRecord(record);
  await fs.rm(runFile(record.repo_path, id), { force: true });
  await fs.rm(cancelFile(record.repo_path, id), { force: true });
  return record;
}

async function load(repoPath: string, taskId: string): Promise<TaskRecord> {
  return await reconcile(await loadTaskRecord(repoPath, taskId));
}

async function runningCount(): Promise<number> {
  let n = 0;
  for (const r of await listTaskRecords()) {
    if (r.state === "RUNNING" && (await reconcile(r)).state === "RUNNING") n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Starting turns

function turnDeadline(record: TaskRecord, start: number): string {
  const t = record.task;
  let ms = parseDuration(t.worker.print_timeout) + 10 * 60_000;
  if (!record.setup_ok) ms += parseDuration(t.limits.setup_timeout) * Math.max(1, t.setup_commands.length);
  ms += parseDuration(t.limits.validation_timeout) * t.validation_commands.length;
  return new Date(start + ms).toISOString();
}

async function beginTurn(record: TaskRecord, kind: TurnKind, input?: string, extras: PromptExtras = {}, extra: Record<string, unknown> = {}) {
  const id = record.task.task_id;
  if (await runningCount() >= maxParallel()) {
    throw new Error(`Max parallel workers reached (${maxParallel()}). await_task on a running task first, or raise GRAVITYBRIDGE_MAX_PARALLEL.`);
  }
  assertTransition(id, record.state, "RUNNING");
  const turnNo = record.turns.length + 1;
  await writeTaskFile(record.repo_path, id, path.join("prompts", `${turnNo}.md`), buildPrompt(record, kind, input, extras));
  await fs.rm(cancelFile(record.repo_path, id), { force: true });
  const now = Date.now();
  record.state = "RUNNING";
  record.last_error = undefined;
  record.active_run = { turn: turnNo, kind, started_at: new Date(now).toISOString(), deadline_at: turnDeadline(record, now) };
  await saveTaskRecord(record);

  const logFd = fsSync.openSync(path.join(taskDir(record.repo_path, id), "runner.log"), "a");
  try {
    const nodeArgs = runningFromSource ? ["--import", "tsx"] : [];
    const child = spawn(process.execPath, [...nodeArgs, siblingModule("runner"), record.repo_path, id, String(turnNo)], {
      cwd: packageDir,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
    });
    child.on("error", () => undefined);
    child.unref();
  } finally {
    fsSync.closeSync(logFd);
  }
  return summarize(record, null, { message: `Turn ${turnNo} (${kind}) started in the background. Call await_task.`, ...extra });
}

export async function startTask(repoPathInput: string, rawTask: unknown) {
  const repoPath = await resolveRepo(repoPathInput);
  const task = TaskContractSchema.parse(rawTask);
  return await withLock(`${repoPath}:${task.task_id}`, async () => {
    await assertCleanRepository(repoPath);
    const headNow = await headSha(repoPath);
    if (task.base_sha) {
      const resolved = await resolveCommit(repoPath, task.base_sha);
      if (resolved !== headNow) {
        throw new Error(`base_sha ${task.base_sha} is not the current HEAD (${headNow}). Check out that commit or omit base_sha.`);
      }
    }
    if (await branchExists(repoPath, `gb/${task.task_id}`)) {
      throw new Error(`Branch gb/${task.task_id} already exists. Choose a new task_id.`);
    }
    const related = await relatedContext(repoPath, task.task_id, task.related_tasks);
    const dir = await claimTaskDir(repoPath, task.task_id);
    let wt: { branchName: string; worktreePath: string };
    try {
      wt = await createTaskWorktree(repoPath, task.task_id, headNow);
    } catch (error) {
      await fs.rm(dir, { recursive: true, force: true });
      throw error;
    }
    const now = new Date().toISOString();
    const record: TaskRecord = {
      schema_version: "1.1",
      repo_path: repoPath,
      repo_key: path.basename(path.dirname(dir)),
      task: { ...task, base_sha: headNow },
      state: "CREATED",
      branch_name: wt.branchName,
      worktree_path: wt.worktreePath,
      retries: 0,
      rework_cycles: 0,
      blocker_answers: 0,
      same_failure_count: 0,
      setup_ok: false,
      created_at: now,
      updated_at: now,
      changed_files: [],
      scope_violations: [],
      turns: [],
    };
    await writeJsonAtomic(path.join(dir, "task.json"), record.task);
    await saveTaskRecord(record);
    const warnings = lintContract(task);
    return await beginTurn(record, "initial", undefined, { related }, { contract_warnings: nonEmpty(warnings) });
  });
}

/** Render what related tasks already did, so the worker builds on it instead of re-exploring. */
async function relatedContext(repoPath: string, selfId: string, ids: string[]): Promise<string | undefined> {
  if (!ids.length) return undefined;
  const blocks: string[] = [];
  for (const id of ids) {
    if (id === selfId) throw new Error("related_tasks must not contain the task itself.");
    let r: TaskRecord;
    try {
      r = await loadTaskRecord(repoPath, id);
    } catch {
      throw new Error(`related_tasks: task ${id} not found in this repository.`);
    }
    const last = await latestTurn(r);
    const files = r.changed_files.slice(0, 30).map((f) => f.path);
    const notes = r.last_review?.non_blocking_findings?.slice(0, 5) ?? [];
    blocks.push([
      `### ${id} (${r.state})`,
      `Goal: ${head(r.task.goal, 400)}`,
      files.length ? `Files changed: ${files.join(", ")}${r.changed_files.length > 30 ? ", ..." : ""}` : "Files changed: (none)",
      last?.worker_result ? `Worker summary: ${head(last.worker_result.summary, 1_200)}` : "",
      notes.length ? `Codex review notes: ${notes.map((n) => head(n, 200)).join(" | ")}` : "",
    ].filter(Boolean).join("\n"));
  }
  return head(blocks.join("\n\n"), 8_000);
}

function assertTaskBudget(record: TaskRecord) {
  const l = tokenLimits(record.task);
  const used = record.usage_total?.total_tokens ?? 0;
  if (l.max_task_tokens && used >= l.max_task_tokens) {
    throw new Error(`Task token budget exhausted (${budgetLine(used, l.max_task_tokens)}). record_review TAKEOVER or REJECT, or start a new, narrower task (use related_tasks to pass on what was done).`);
  }
}

export async function continueTask(repoPathInput: string, taskId: string, feedback?: string) {
  const repoPath = await resolveRepo(repoPathInput);
  return await withLock(`${repoPath}:${taskId}`, async () => {
    const record = await load(repoPath, taskId);
    const l = record.task.limits;
    if (record.state === "CHANGES_REQUESTED" || record.state === "BLOCKED") assertTaskBudget(record);
    if (record.state === "CHANGES_REQUESTED") {
      const text = feedback?.trim() || record.last_review?.blocking_findings.map((f, i) => `${i + 1}. ${f}`).join("\n");
      if (!text) throw new Error("feedback is required (no blocking_findings recorded in the last review).");
      return await beginTurn(record, "rework", text);
    }
    if (record.state === "BLOCKED") {
      if (!feedback?.trim()) throw new Error("feedback is required: answer the worker's blocker question(s) explicitly.");
      if (record.blocker_answers >= l.max_blocker_answers) {
        throw new Error(`Blocker-answer budget exhausted (${record.blocker_answers}/${l.max_blocker_answers}). record_review TAKEOVER or REJECT.`);
      }
      record.blocker_answers += 1;
      return await beginTurn(record, "blocker_answer", feedback);
    }
    throw new Error(`continue_task needs state CHANGES_REQUESTED (after record_review REWORK) or BLOCKED; task is ${record.state}. ${nextActionHint(record.state)}`);
  });
}

export async function retryTask(repoPathInput: string, taskId: string) {
  const repoPath = await resolveRepo(repoPathInput);
  return await withLock(`${repoPath}:${taskId}`, async () => {
    const record = await load(repoPath, taskId);
    if (record.state !== "WORKER_FAILED" && record.state !== "CANCELED") {
      throw new Error(`retry_task only applies to WORKER_FAILED or CANCELED; task is ${record.state}. ${nextActionHint(record.state)}`);
    }
    const l = record.task.limits;
    if (record.retries >= l.max_retries) {
      throw new Error(`Retry budget exhausted (${record.retries}/${l.max_retries}). record_review TAKEOVER or REJECT.`);
    }
    if (record.state === "WORKER_FAILED" && record.same_failure_count >= 2) {
      throw new Error(`The same failure happened ${record.same_failure_count} times in a row; retrying again is unlikely to help. Fix the cause (environment, permissions, task contract) or record_review TAKEOVER. Last error: ${head(record.last_error ?? "", 600)}`);
    }
    assertTaskBudget(record);
    record.retries += 1;
    return await beginTurn(record, "retry");
  });
}

// ---------------------------------------------------------------------------
// Waiting / inspection

async function progress(record: TaskRecord) {
  const file = path.join(taskDir(record.repo_path, record.task.task_id), "events.ndjson");
  let steps = 0;
  let lastTool: string | undefined;
  let lastText: string | undefined;
  try {
    const stat = await fs.stat(file);
    const fh = await fs.open(file, "r");
    try {
      const len = Math.min(stat.size, 128 * 1024);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, stat.size - len);
      for (const line of buf.toString("utf8").split("\n")) {
        try {
          const ev = JSON.parse(line);
          if (ev.event === "step_update") {
            steps++;
            const s = ev.step_update ?? {};
            if (s.tool_name || s.tool_info?.name) lastTool = s.tool_name ?? s.tool_info?.name;
            if (typeof s.text === "string" && s.text.trim()) lastText = head(s.text.trim(), 300);
          }
        } catch { /* partial line */ }
      }
    } finally {
      await fh.close();
    }
  } catch { /* no events yet */ }
  const started = Date.parse(record.active_run?.started_at ?? record.updated_at);
  const live = (await readJson<{ live?: { usage?: TokenUsage; tool_steps: number } }>(runFile(record.repo_path, record.task.task_id)).catch(() => null))?.live;
  const l = tokenLimits(record.task);
  return {
    elapsed_seconds: Math.round((Date.now() - started) / 1000),
    turn_tokens: live?.usage ? budgetLine(live.usage.total_tokens, l.max_turn_tokens) : undefined,
    turn_tool_calls: live ? `${live.tool_steps}${l.max_turn_tool_steps ? ` / ${l.max_turn_tool_steps}` : ""}` : undefined,
    recent_steps: steps,
    last_tool: lastTool,
    last_message: lastText,
    deadline_at: record.active_run?.deadline_at,
  };
}

export async function awaitTask(repoPathInput: string, taskId: string, waitSeconds = 45) {
  const repoPath = await resolveRepo(repoPathInput);
  const limit = Math.max(0, Math.min(waitSeconds, 50)) * 1000;
  const started = Date.now();
  for (;;) {
    const record = await load(repoPath, taskId);
    if (record.state !== "RUNNING") return summarize(record, await latestTurn(record));
    if (Date.now() - started >= limit) {
      return summarize(record, null, { progress: await progress(record), message: "Still running. Call await_task again." });
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

export async function getTask(repoPathInput: string, taskId: string) {
  const repoPath = await resolveRepo(repoPathInput);
  const record = await load(repoPath, taskId);
  return summarize(record, await latestTurn(record), {
    goal: record.task.goal,
    scope: record.task.scope,
    acceptance_criteria: record.task.acceptance_criteria,
    validation_commands: record.task.validation_commands,
    turns: record.turns,
    last_review: record.last_review,
    cleaned_up: record.cleaned_up,
    progress: record.state === "RUNNING" ? await progress(record) : undefined,
  });
}

export async function listTasks(repoPathInput?: string, includeClosed = false) {
  const repoPath = repoPathInput ? await resolveRepo(repoPathInput) : undefined;
  const out = [];
  let total = 0;
  for (const r0 of await listTaskRecords(repoPath)) {
    const r = await reconcile(r0);
    if (!includeClosed && r.cleaned_up) continue;
    out.push({
      task_id: r.task.task_id, state: r.state, repo_path: r.repo_path, branch: r.branch_name,
      turns: r.turns.length, updated_at: r.updated_at, next_action: nextActionHint(r.state),
      tokens: r.usage_total ? fmtTokens(r.usage_total.total_tokens) : undefined,
    });
    total += r.usage_total?.total_tokens ?? 0;
  }
  return {
    tasks: out, running: out.filter((t) => t.state === "RUNNING").length, max_parallel: maxParallel(),
    tokens_total: total ? fmtTokens(total) : undefined,
  };
}

export async function getTaskDiff(
  repoPathInput: string, taskId: string,
  opts: { range?: "cumulative" | "last_turn"; mode?: "stat" | "full"; path?: string; max_bytes?: number } = {},
) {
  const repoPath = await resolveRepo(repoPathInput);
  const record = await load(repoPath, taskId);
  const range = opts.range ?? "cumulative";
  const mode = opts.mode ?? "stat";
  const max = Math.max(1_000, Math.min(opts.max_bytes ?? 60_000, 400_000));
  let from = record.task.base_sha;
  let to = record.branch_name;
  if (range === "last_turn") {
    const last = record.turns.at(-1);
    if (!last?.head_before || !last.head_after) throw new Error("No completed turn with git evidence yet.");
    from = last.head_before;
    to = last.head_after;
  }
  const diff = await diffBetween(repoPath, from, to, mode, opts.path);
  return {
    task_id: taskId, state: record.state, range, mode, from, to,
    note: record.state === "RUNNING" ? "Worker is still running; diff shows the last finished turn only." : undefined,
    truncated: diff.length > max || undefined,
    diff: head(diff, max) || "(no changes)",
  };
}

export async function getTaskEvents(repoPathInput: string, taskId: string, count = 40, maxBytes = 30_000) {
  const repoPath = await resolveRepo(repoPathInput);
  await loadTaskRecord(repoPath, taskId);
  return { task_id: taskId, events: await readEvents(repoPath, taskId, count, Math.min(maxBytes, 200_000)) };
}

export async function getWorkerResult(repoPathInput: string, taskId: string, turn?: number) {
  const repoPath = await resolveRepo(repoPathInput);
  await loadTaskRecord(repoPath, taskId);
  const result = await loadTurn(repoPath, taskId, turn);
  if (!result) throw new Error(turn ? `No result for turn ${turn}.` : "No finished turn yet.");
  return result as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Control

export async function cancelTask(repoPathInput: string, taskId: string) {
  const repoPath = await resolveRepo(repoPathInput);
  return await withLock(`${repoPath}:${taskId}`, async () => {
    let record = await load(repoPath, taskId);
    if (record.state !== "RUNNING") return summarize(record, null, { message: `Not running (state ${record.state}); nothing to cancel.` });
    await writeJsonAtomic(cancelFile(repoPath, taskId), { requested_at: new Date().toISOString() });
    const until = Date.now() + 15_000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 500));
      record = await loadTaskRecord(repoPath, taskId);
      if (record.state !== "RUNNING") return summarize(record, await latestTurn(record), { message: "Canceled." });
    }
    // Runner did not finish gracefully: kill everything and reconcile.
    const run = await readJson<RunInfo & { agy_pid?: number }>(runFile(repoPath, taskId));
    if (run?.agy_pid) killTree(run.agy_pid, "SIGKILL");
    if (run?.pid) killTree(run.pid, "SIGKILL");
    await new Promise((r) => setTimeout(r, 500));
    record = await loadTaskRecord(repoPath, taskId);
    if (record.state === "RUNNING") record = await markOrphan(record, "Canceled by Codex (forced).");
    return summarize(record, await latestTurn(record), { message: "Canceled (forced)." });
  });
}

const DECISION_TARGET: Record<Review["decision"], TaskState> = {
  ACCEPT: "ACCEPTED",
  REWORK: "CHANGES_REQUESTED",
  REJECT: "REJECTED",
  TAKEOVER: "CODEX_TAKEOVER",
};

export async function recordReview(repoPathInput: string, rawReview: unknown) {
  const repoPath = await resolveRepo(repoPathInput);
  const review = ReviewSchema.parse(rawReview);
  return await withLock(`${repoPath}:${review.task_id}`, async () => {
    const record = await load(repoPath, review.task_id);
    const target = DECISION_TARGET[review.decision];
    if (record.state === "RUNNING") throw new Error("Task is still RUNNING. await_task (or cancel_task) first.");
    assertTransition(review.task_id, record.state, target);
    const latest = await latestTurn(record);
    const warnings: string[] = [];
    if (review.decision === "ACCEPT") {
      if (record.scope_violations.length) {
        throw new Error(`Cannot ACCEPT: scope violations must be fixed first (REWORK) or the task taken over:\n- ${record.scope_violations.join("\n- ")}`);
      }
      const failed = (latest?.bridge_validation ?? []).filter((c) => c.exit_code !== 0).map((c) => c.command);
      if (failed.length && !review.override_reason) {
        throw new Error(`Cannot ACCEPT: GravityBridge validation failed (${failed.join(", ")}). REWORK, or pass override_reason if the failure is pre-existing/unrelated.`);
      }
      if (latest?.claim_mismatches?.length) warnings.push("Worker claims did not match git evidence; make sure you reviewed the real diff.");
      if (latest?.git_violations?.length) warnings.push(...latest.git_violations);
      if (!record.task.validation_commands.length) warnings.push("Task had no validation_commands; nothing was verified independently.");
    }
    if (review.decision === "REWORK") {
      if (!review.blocking_findings.length) throw new Error("REWORK requires at least one blocking_findings entry.");
      if (record.rework_cycles >= record.task.limits.max_rework_cycles) {
        throw new Error(`Rework budget exhausted (${record.rework_cycles}/${record.task.limits.max_rework_cycles}). TAKEOVER or REJECT.`);
      }
      record.rework_cycles += 1;
    }
    const n = (await safeCount(path.join(taskDir(repoPath, review.task_id), "reviews"))) + 1;
    await writeJsonAtomic(path.join(taskDir(repoPath, review.task_id), "reviews", `${n}.json`), {
      ...review, recorded_at: new Date().toISOString(), turn: record.turns.length, from_state: record.state,
    });
    record.state = target;
    record.last_review = review;
    await saveTaskRecord(record);
    return summarize(record, latest, { warnings: warnings.length ? warnings : undefined });
  });
}

async function safeCount(dir: string): Promise<number> {
  try { return (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).length; } catch { return 0; }
}

export async function cleanupTask(repoPathInput: string, taskId: string, deleteBranch = false) {
  const repoPath = await resolveRepo(repoPathInput);
  return await withLock(`${repoPath}:${taskId}`, async () => {
    const record = await load(repoPath, taskId);
    if (!TERMINAL_STATES.includes(record.state)) {
      throw new Error(`cleanup_task requires ACCEPTED, REJECTED or CODEX_TAKEOVER; task is ${record.state}.`);
    }
    const notes = await removeWorktree(repoPath, record.worktree_path, record.branch_name, deleteBranch);
    record.cleaned_up = true;
    await saveTaskRecord(record);
    return {
      task_id: taskId, state: record.state, cleaned_up: true, notes,
      kept: [`evidence in ${taskDir(repoPath, taskId)}`, ...(deleteBranch ? [] : [`branch ${record.branch_name}`])],
    };
  });
}
