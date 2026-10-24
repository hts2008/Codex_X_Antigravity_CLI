import { makeRepo, setScenario, task } from "./helpers.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  awaitTask, cancelTask, cleanupTask, continueTask, getTaskDiff, getWorkerResult, listTasks, recordReview, retryTask, startTask,
} from "../src/jobs.ts";
import { runFile } from "../src/store.ts";
import { taskDir } from "../src/paths.ts";
import { killTree } from "../src/process.ts";

async function until(repo: string, id: string) {
  for (let i = 0; i < 20; i++) {
    const s: any = await awaitTask(repo, id, 10);
    if (s.state !== "RUNNING") return s;
  }
  throw new Error("timeout");
}

const review = (id: string, decision: string, over: Record<string, unknown> = {}) =>
  ({ schema_version: "1.0", task_id: id, decision, ...over });

test("happy path: new files are captured, validation runs, accept + cleanup", async () => {
  const repo = makeRepo();
  setScenario("ok");
  const started: any = await startTask(repo, task("t-ok"));
  assert.equal(started.state, "RUNNING");
  const s = await until(repo, "t-ok");
  assert.equal(s.state, "WORKER_COMPLETED", JSON.stringify(s));
  assert.deepEqual(s.changed_files.sort(), ["A src/new.txt", "M src/a.txt"]);
  assert.deepEqual(s.scope_violations, []);
  assert.equal(s.latest_turn.bridge_validation_passed, true);
  assert.equal(s.latest_turn.claim_mismatches, undefined);
  const diff: any = await getTaskDiff(repo, "t-ok", { mode: "full" });
  assert.match(diff.diff, /src\/new\.txt/);
  const accepted: any = await recordReview(repo, review("t-ok", "ACCEPT"));
  assert.equal(accepted.state, "ACCEPTED");
  const c: any = await cleanupTask(repo, "t-ok");
  assert.equal(c.cleaned_up, true);
  assert.ok(!fs.existsSync(s.worktree));
  // branch kept for integration
  execFileSync("git", ["-C", repo, "rev-parse", "--verify", "gb/t-ok"]);
});

test("repeated task_id never destroys the existing worktree", async () => {
  const repo = makeRepo();
  setScenario("ok");
  await startTask(repo, task("t-dup"));
  const s = await until(repo, "t-dup");
  await assert.rejects(startTask(repo, task("t-dup")), /already exists/);
  assert.ok(fs.existsSync(path.join(s.worktree, "src", "new.txt")));
});

test("dirty repo and wrong base_sha are refused", async () => {
  const repo = makeRepo();
  await assert.rejects(startTask(repo, task("t-base", { base_sha: "0000000" })), /base_sha|failed/);
  fs.writeFileSync(path.join(repo, "dirty.txt"), "x");
  await assert.rejects(startTask(repo, task("t-dirty")), /uncommitted/);
});

test("out-of-scope writes and false claims are flagged; ACCEPT blocked; rework fixes it", async () => {
  const repo = makeRepo();
  setScenario("forbidden");
  await startTask(repo, task("t-scope"));
  const s = await until(repo, "t-scope");
  assert.equal(s.state, "WORKER_COMPLETED");
  assert.ok(s.scope_violations.some((v: string) => v.includes("server/secret.txt")), JSON.stringify(s.scope_violations));
  assert.ok(s.latest_turn.claim_mismatches.some((m: string) => m.includes("server/secret.txt")));
  await assert.rejects(recordReview(repo, review("t-scope", "ACCEPT")), /scope violations/);
  await assert.rejects(recordReview(repo, review("t-scope", "REWORK")), /blocking_findings/);
  const r: any = await recordReview(repo, review("t-scope", "REWORK", { blocking_findings: ["Remove server/secret.txt"] }));
  assert.equal(r.state, "CHANGES_REQUESTED");
  setScenario("rework");
  await continueTask(repo, "t-scope");
  const s2 = await until(repo, "t-scope");
  assert.equal(s2.state, "WORKER_COMPLETED");
  assert.deepEqual(s2.scope_violations, []);
  assert.equal(s2.turn, 2);
  const last: any = await getTaskDiff(repo, "t-scope", { range: "last_turn" });
  assert.match(last.diff, /src\/fix\.txt/);
  assert.doesNotMatch(last.diff, /src\/new\.txt/);
  const w: any = await getWorkerResult(repo, "t-scope", 2);
  assert.equal(w.kind, "rework");
  assert.match(fs.readFileSync(path.join(taskDir(repo, "t-scope"), "prompts", "2.md"), "utf8"), /Remove server\/secret\.txt/);
  assert.equal((await recordReview(repo, review("t-scope", "ACCEPT")) as any).state, "ACCEPTED");
});

test("failed bridge validation requires override_reason to ACCEPT", async () => {
  const repo = makeRepo();
  setScenario("ok");
  await startTask(repo, task("t-val", { validation_commands: [`node -e "process.exit(1)"`] }));
  const s = await until(repo, "t-val");
  assert.equal(s.latest_turn.bridge_validation_passed, false);
  await assert.rejects(recordReview(repo, review("t-val", "ACCEPT")), /validation failed/);
  const ok: any = await recordReview(repo, review("t-val", "ACCEPT", { override_reason: "Pre-existing failure on base, unrelated." }));
  assert.equal(ok.state, "ACCEPTED");
});

test("invalid structured output -> WORKER_FAILED; same failure twice blocks retry", async () => {
  const repo = makeRepo();
  setScenario("invalid");
  await startTask(repo, task("t-invalid"));
  let s = await until(repo, "t-invalid");
  assert.equal(s.state, "WORKER_FAILED");
  assert.match(s.last_error, /Structured result/);
  await retryTask(repo, "t-invalid");
  s = await until(repo, "t-invalid");
  assert.equal(s.state, "WORKER_FAILED");
  assert.equal(s.budgets.same_failure_count, 2);
  await assert.rejects(retryTask(repo, "t-invalid"), /same failure/);
  assert.equal((await recordReview(repo, review("t-invalid", "TAKEOVER")) as any).state, "CODEX_TAKEOVER");
});

test("crash without result -> WORKER_FAILED with stderr; retry resumes conversation", async () => {
  const repo = makeRepo();
  setScenario("crash");
  await startTask(repo, task("t-crash"));
  const s = await until(repo, "t-crash");
  assert.equal(s.state, "WORKER_FAILED");
  assert.match(s.last_error, /something broke/);
  setScenario("ok");
  const log = path.join(path.dirname(repo), "args-crash.log");
  process.env.FAKE_AGY_ARGS_LOG = log;
  await retryTask(repo, "t-crash");
  const s2 = await until(repo, "t-crash");
  delete process.env.FAKE_AGY_ARGS_LOG;
  assert.equal(s2.state, "WORKER_COMPLETED");
  const argv = JSON.parse(fs.readFileSync(log, "utf8").trim()).argv as string[];
  assert.ok(argv.includes("--conversation"));
  assert.ok(argv.includes("gb-coder"));
});

test("blocked worker: continue requires an answer", async () => {
  const repo = makeRepo();
  setScenario("blocked");
  await startTask(repo, task("t-block"));
  const s = await until(repo, "t-block");
  assert.equal(s.state, "BLOCKED");
  assert.equal(s.latest_turn.blockers[0].question, "Which color?");
  await assert.rejects(continueTask(repo, "t-block"), /feedback is required/);
  setScenario("ok");
  await continueTask(repo, "t-block", "Use blue.");
  assert.equal((await until(repo, "t-block")).state, "WORKER_COMPLETED");
});

test("cancel a running task", async () => {
  const repo = makeRepo();
  setScenario("slow");
  await startTask(repo, task("t-cancel"));
  const first: any = await awaitTask(repo, "t-cancel", 3);
  assert.equal(first.state, "RUNNING");
  assert.ok(first.progress);
  const c: any = await cancelTask(repo, "t-cancel");
  assert.equal(c.state, "CANCELED");
  assert.ok(c.changed_files.includes("A src/partial.txt"), JSON.stringify(c.changed_files));
});

test("orphaned runner (killed) is reconciled instead of staying RUNNING forever", async () => {
  const repo = makeRepo();
  setScenario("slow");
  await startTask(repo, task("t-orphan"));
  let run: any;
  for (let i = 0; i < 50 && !run?.agy_pid; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try { run = JSON.parse(fs.readFileSync(runFile(repo, "t-orphan"), "utf8")); } catch { /* not yet */ }
  }
  assert.ok(run?.pid);
  killTree(run.pid, "SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  const s: any = await awaitTask(repo, "t-orphan", 2);
  assert.equal(s.state, "WORKER_FAILED");
  assert.match(s.last_error, /without finalising/);
  const list: any = await listTasks(repo);
  assert.equal(list.running, 0);
});
