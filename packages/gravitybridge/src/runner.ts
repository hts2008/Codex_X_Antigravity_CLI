/**
 * Detached per-turn runner. Started by the MCP server, survives MCP/Codex restarts.
 * Owns the task record while state === RUNNING.
 *
 * usage: node runner.js <repo_path> <task_id> <turn>
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { workerEnv } from "./env.js";
import { exists, head, tail, writeJsonAtomic } from "./fsutil.js";
import { changedFilesBetween, currentBranch, diffBetween, headSha, snapshotCommit } from "./git.js";
import { gravityHome, parseDuration, resultSchemaPath, taskDir } from "./paths.js";
import { agyCommand, killTree, runShellCommand } from "./process.js";
import { checkScope, normalizeRel } from "./scope.js";
import { failureSignature } from "./state.js";
import {
  cancelFile, EventLog, loadTaskRecord, runFile, saveTaskRecord, saveTurn, writeTaskFile, type RunInfo,
} from "./store.js";
import {
  WorkerResultSchema, type TaskRecord, type TaskState, type TurnSummary, type WorkerEnvelope,
} from "./types.js";

const PERMISSION_HINT = /(permission|denied|not allowed|soft-den|requires approval|blocked by)/i;

interface AgyOutcome {
  exitCode: number | null;
  envelope?: WorkerEnvelope;
  conversationId?: string;
  stderr: string;
  permissionNotices: string[];
  toolErrors: string[];
  toolSteps: number;
  canceled: boolean;
  watchdog: boolean;
  spawnError?: string;
}

async function runAgy(record: TaskRecord, prompt: string, kind: string, runInfo: RunInfo & { agy_pid?: number }): Promise<AgyOutcome> {
  const t = record.task;
  const { command, prefixArgs } = agyCommand();
  const args = [
    ...prefixArgs,
    "-p", prompt,
    "--output-format", "stream-json",
    "--json-schema", resultSchemaPath,
    "--effort", t.worker.effort,
    "--agent", t.worker.agent,
    "--print-timeout", t.worker.print_timeout,
  ];
  if (t.worker.model) args.push("--model", t.worker.model);
  if (kind !== "initial" && record.conversation_id) args.push("--conversation", record.conversation_id);

  const out: AgyOutcome = {
    exitCode: null, stderr: "", permissionNotices: [], toolErrors: [], toolSteps: 0, canceled: false, watchdog: false,
  };
  const events = new EventLog(path.join(taskDir(record.repo_path, t.task_id), "events.ndjson"));
  await events.append(JSON.stringify({ event: "gravitybridge_turn_start", turn: runInfo.turn, kind, at: new Date().toISOString() }));

  const child = spawn(command, args, {
    cwd: record.worktree_path,
    windowsHide: true,
    shell: false,
    detached: process.platform !== "win32",
    env: workerEnv({ GRAVITYBRIDGE_HOME: gravityHome(), GRAVITYBRIDGE_TASK_ID: t.task_id }),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const spawnFailed = new Promise<void>((resolve) => {
    child.once("error", (e) => {
      out.spawnError = (e as NodeJS.ErrnoException).code === "ENOENT"
        ? `Antigravity CLI not found (${command}). Install agy or set GRAVITYBRIDGE_AGY to the full path of agy.exe/agy.`
        : `Failed to start Antigravity: ${e.message}`;
      resolve();
    });
  });

  if (child.pid) {
    runInfo.agy_pid = child.pid;
    await writeJsonAtomic(runFile(record.repo_path, t.task_id), runInfo);
  }

  const deadline = parseDuration(t.worker.print_timeout) + 120_000;
  const watchdog = setTimeout(() => { out.watchdog = true; killTree(child); }, deadline);
  const cancelPoll = setInterval(async () => {
    if (!out.canceled && (await exists(cancelFile(record.repo_path, t.task_id)))) {
      out.canceled = true;
      killTree(child);
    }
  }, 1_000);

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    out.stderr = (out.stderr + chunk).slice(-65_536);
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim() && PERMISSION_HINT.test(line) && out.permissionNotices.length < 30) out.permissionNotices.push(head(line.trim(), 400));
    }
  });

  const stdoutDone = (async () => {
    if (!child.stdout) return;
    child.stdout.setEncoding("utf8");
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      await events.append(line);
      let ev: Record<string, any>;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.event === "init" && typeof ev.conversation_id === "string" && ev.conversation_id) out.conversationId = ev.conversation_id;
      if (ev.event === "step_update" && ev.step_update) {
        const s = ev.step_update;
        if (s.step_type === "tool" && s.state === "DONE") {
          out.toolSteps += 1;
          const err = s.tool_info?.error;
          if (err && out.toolErrors.length < 30) out.toolErrors.push(head(`${s.tool_name ?? s.tool_info?.name}: ${err.message ?? JSON.stringify(err)}`, 400));
        }
      }
      if (ev.event === "result" && ev.result && typeof ev.result === "object") out.envelope = ev.result as WorkerEnvelope;
    }
  })();

  const closed = new Promise<void>((resolve) => child.once("close", (code) => { out.exitCode = code; resolve(); }));
  await Promise.race([closed, spawnFailed]);
  if (!out.spawnError) await stdoutDone.catch(() => undefined);
  clearTimeout(watchdog);
  clearInterval(cancelPoll);
  if (out.envelope?.conversation_id) out.conversationId = out.envelope.conversation_id;
  await writeTaskFile(record.repo_path, t.task_id, "stderr.log", out.stderr);
  return out;
}

async function main(): Promise<void> {
  const [repoPath, taskId, turnArg] = process.argv.slice(2);
  const turnNo = Number(turnArg);
  let record = await loadTaskRecord(repoPath, taskId);
  if (record.state !== "RUNNING" || record.active_run?.turn !== turnNo) {
    throw new Error(`Runner started for turn ${turnNo} but record is ${record.state}/${record.active_run?.turn}`);
  }
  const kind = record.active_run.kind;
  const runInfo: RunInfo & { agy_pid?: number } = { pid: process.pid, turn: turnNo, started_at: new Date().toISOString() };
  await writeJsonAtomic(runFile(repoPath, taskId), runInfo);

  const t = record.task;
  const wt = record.worktree_path;
  const turn: TurnSummary = { turn: turnNo, kind, started_at: record.active_run.started_at };
  let outcome: TaskState = "WORKER_FAILED";
  let error: string | undefined;

  try {
    turn.head_before = await headSha(wt);

    // 1. Environment setup (bridge-owned, once per task until it succeeds)
    if (!record.setup_ok && t.setup_commands.length) {
      turn.setup = [];
      for (const cmd of t.setup_commands) {
        const r = await runShellCommand(cmd, wt, parseDuration(t.limits.setup_timeout), workerEnv());
        turn.setup.push(r);
        if (r.exit_code !== 0) { error = `setup command failed: ${cmd} (exit ${r.exit_code}${r.timed_out ? ", timed out" : ""})`; break; }
      }
      if (!error) record.setup_ok = true;
    } else if (!t.setup_commands.length) {
      record.setup_ok = true;
    }

    // 2. Worker turn
    let agy: AgyOutcome | undefined;
    if (!error) {
      const prompt = await fs.readFile(path.join(taskDir(repoPath, taskId), "prompts", `${turnNo}.md`), "utf8");
      agy = await runAgy(record, prompt, kind, runInfo);
      if (agy.conversationId) record.conversation_id = agy.conversationId;
      turn.exit_code = agy.exitCode;
      turn.agy_status = agy.envelope?.status;
      turn.permission_notices = agy.permissionNotices;
      turn.tool_errors = agy.toolErrors;
      turn.tool_steps = agy.toolSteps;
      turn.usage = agy.envelope?.usage;

      if (agy.canceled) { outcome = "CANCELED"; error = "Canceled by Codex (cancel_task)."; }
      else if (agy.spawnError) error = agy.spawnError;
      else if (agy.watchdog) error = `Worker exceeded print_timeout (${t.worker.print_timeout}) + grace and was killed.`;
      else if (!agy.envelope) error = `No terminal result event (exit ${agy.exitCode}). stderr: ${tail(agy.stderr, 1_500)}`;
      else if (agy.exitCode !== 0 || agy.envelope.status !== "SUCCESS") {
        error = `Antigravity status ${agy.envelope.status ?? "?"} (exit ${agy.exitCode}): ${agy.envelope.error ?? tail(agy.stderr, 1_500)}`;
      } else {
        const parsed = WorkerResultSchema.safeParse(agy.envelope.structured_output);
        if (!parsed.success) {
          error = `Structured result missing or invalid: ${head(parsed.error.message, 1_500)}`;
        } else {
          turn.worker_result = parsed.data;
          outcome = parsed.data.worker_status === "blocked" ? "BLOCKED" : "WORKER_COMPLETED";
        }
      }
    }

    // 3. Git evidence: verify branch, snapshot everything (incl. new files), compute diffs
    const gitViolations: string[] = [];
    const branch = await currentBranch(wt);
    const headMid = await headSha(wt);
    if (branch !== record.branch_name) gitViolations.push(`worker switched branch to '${branch}' (expected ${record.branch_name})`);
    if (headMid !== turn.head_before) gitViolations.push("worker created git commits itself (kept, but not allowed)");
    if (branch === record.branch_name) {
      turn.head_after = await snapshotCommit(wt, `gb(${taskId}): turn ${turnNo} ${kind}`);
    } else {
      turn.head_after = headMid;
      if (outcome !== "CANCELED") { outcome = "WORKER_FAILED"; error = `Git violation: ${gitViolations.join("; ")}`; }
    }
    turn.git_violations = gitViolations;

    const turnFiles = await changedFilesBetween(wt, turn.head_before, turn.head_after);
    turn.turn_changed_files = turnFiles.map((f) => f.path);
    record.changed_files = await changedFilesBetween(wt, t.base_sha, turn.head_after);
    record.scope_violations = checkScope(record.changed_files, { ...t.scope, mutating: t.mutating });
    turn.scope_violations = record.scope_violations;
    await writeTaskFile(repoPath, taskId, path.join("turns", `${turnNo}.diff`),
      head(await diffBetween(wt, turn.head_before, turn.head_after, "full"), 2_000_000));

    // 4. Claims vs evidence
    const mismatches: string[] = [];
    if (turn.worker_result) {
      const wr = turn.worker_result;
      if (wr.task_id !== taskId) mismatches.push(`task_id in result is '${wr.task_id}', expected '${taskId}'`);
      const cumulative = new Set(record.changed_files.flatMap((f) => [f.path, f.old_path].filter(Boolean) as string[]).map(normalizeRel));
      const claimed = new Set(wr.files_changed.map(normalizeRel));
      for (const c of claimed) if (!cumulative.has(c)) mismatches.push(`claimed changed but not in git: ${c}`);
      for (const f of turn.turn_changed_files) if (!claimed.has(normalizeRel(f))) mismatches.push(`changed in git but not claimed: ${f}`);
    }
    turn.claim_mismatches = mismatches.slice(0, 50);

    // 5. Independent validation (bridge-run) for completed turns
    if (outcome === "WORKER_COMPLETED" && t.validation_commands.length) {
      turn.bridge_validation = [];
      for (const cmd of t.validation_commands) {
        turn.bridge_validation.push(await runShellCommand(cmd, wt, parseDuration(t.limits.validation_timeout), workerEnv()));
      }
    }
  } catch (e) {
    outcome = "WORKER_FAILED";
    error = `GravityBridge runner error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`;
  }

  // 6. Finalize (record first, then remove run file — the MCP server relies on this order)
  record = { ...(await loadTaskRecord(repoPath, taskId)), ...pick(record) };
  turn.finished_at = new Date().toISOString();
  turn.outcome = outcome;
  turn.error = error ? head(error, 4_000) : undefined;
  record.state = outcome;
  record.last_error = turn.error;
  if (outcome === "WORKER_FAILED") {
    const sig = failureSignature(error ?? "");
    record.same_failure_count = sig === record.last_failure_signature ? record.same_failure_count + 1 : 1;
    record.last_failure_signature = sig;
  } else if (outcome !== "CANCELED") {
    record.same_failure_count = 0;
    record.last_failure_signature = undefined;
  }
  record.active_run = undefined;
  record.turns.push(compactTurn(turn));
  await saveTurn(repoPath, taskId, turn);
  await saveTaskRecord(record);
  await fs.rm(runFile(repoPath, taskId), { force: true });
  await fs.rm(cancelFile(repoPath, taskId), { force: true });
}

/** Fields the runner owns; merged over a fresh read of the record. */
function pick(r: TaskRecord): Partial<TaskRecord> {
  return {
    conversation_id: r.conversation_id, setup_ok: r.setup_ok, changed_files: r.changed_files, scope_violations: r.scope_violations,
  };
}

function compactTurn(t: TurnSummary): TurnSummary {
  return {
    turn: t.turn, kind: t.kind, started_at: t.started_at, finished_at: t.finished_at, outcome: t.outcome,
    error: t.error ? head(t.error, 500) : undefined, head_before: t.head_before, head_after: t.head_after,
    turn_changed_files: t.turn_changed_files?.slice(0, 100), tool_steps: t.tool_steps,
  };
}

main().catch(async (e) => {
  // Last-resort: never leave a task stuck in RUNNING.
  const [repoPath, taskId] = process.argv.slice(2);
  try {
    const record = await loadTaskRecord(repoPath, taskId);
    if (record.state === "RUNNING") {
      record.state = "WORKER_FAILED";
      record.last_error = `GravityBridge runner crashed: ${e instanceof Error ? e.message : String(e)}`;
      record.active_run = undefined;
      await saveTaskRecord(record);
    }
    await fs.rm(runFile(repoPath, taskId), { force: true });
  } catch { /* nothing else we can do */ }
  console.error(e);
  process.exit(1);
});

