import { makeRepo, setScenario, task } from "./helpers.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { awaitTask, getTask, listTasks, recordReview, retryTask, startTask } from "../src/jobs.ts";
import { gluedWords, lintContract } from "../src/lint.ts";
import { taskDir } from "../src/paths.ts";
import { TaskContractSchema } from "../src/types.ts";
import { addUsage, normalizeUsage, subUsage } from "../src/usage.ts";

async function until(repo: string, id: string) {
  for (let i = 0; i < 30; i++) {
    const s: any = await awaitTask(repo, id, 10);
    if (s.state !== "RUNNING") return s;
  }
  throw new Error("timeout");
}

test("usage helpers normalise, add and diff", () => {
  const a = normalizeUsage({ input_tokens: 10, output_tokens: 5, cache_read_tokens: 3 })!;
  assert.equal(a.total_tokens, 15);
  assert.equal(normalizeUsage({ input_tokens: 0 }), undefined);
  assert.equal(addUsage(a, a).total_tokens, 30);
  assert.equal(subUsage(addUsage(a, a), a)!.input_tokens, 10);
  assert.equal(subUsage(a, addUsage(a, a)), undefined);
});

test("per-turn usage and tool counts are recorded and summarised", async () => {
  const repo = makeRepo();
  setScenario("ok");
  await startTask(repo, task("u-ok", { context: ["src/a.txt"] }));
  const s = await until(repo, "u-ok");
  assert.equal(s.state, "WORKER_COMPLETED", JSON.stringify(s));
  assert.match(s.usage.task_total, /total 1k · in 1k · out 210/);
  assert.match(s.usage.latest_turn_top_tools, /view_file 1/);
  assert.match(s.budgets.task_tokens, /\/ 4\.00M/);
  const full: any = await getTask(repo, "u-ok");
  assert.equal(full.turns[0].usage.total_tokens, 1310);
  assert.equal(full.turns[0].usage.cache_read_tokens, 5000);
  const list: any = await listTasks(repo);
  assert.equal(list.tasks[0].tokens, "1k");
  const prompt = fs.readFileSync(path.join(taskDir(repo, "u-ok"), "prompts", "1.md"), "utf8");
  assert.match(prompt, /Work efficiently/);
  assert.match(prompt, /1\.50M tokens or 250 tool calls/);
});

test("turn token budget stops a runaway worker; task budget then refuses retry", async () => {
  const repo = makeRepo();
  setScenario("tokenhog");
  await startTask(repo, task("u-hog", { context: ["src/a.txt"], limits: { max_turn_tokens: 1_000_000, max_task_tokens: 1_000_000 } }));
  const s = await until(repo, "u-hog");
  assert.equal(s.state, "WORKER_FAILED", JSON.stringify(s));
  assert.match(s.last_error, /Budget stop: turn token budget reached/);
  assert.ok(s.efficiency_warnings.some((w: string) => /stopped by a budget/.test(w)));
  assert.deepEqual(s.changed_files, ["A src/new.txt"]); // partial work snapshotted
  await assert.rejects(retryTask(repo, "u-hog"), /Task token budget exhausted/);
  const r: any = await recordReview(repo, { schema_version: "1.0", task_id: "u-hog", decision: "TAKEOVER" });
  assert.equal(r.state, "CODEX_TAKEOVER");
});

test("tool-step budget stops a looping worker", async () => {
  const repo = makeRepo();
  setScenario("toolhog");
  await startTask(repo, task("u-tools", { context: ["src/a.txt"], limits: { max_turn_tool_steps: 15 } }));
  const s = await until(repo, "u-tools");
  assert.equal(s.state, "WORKER_FAILED", JSON.stringify(s));
  assert.match(s.last_error, /tool-step budget reached \(15/);
});

test("related_tasks inject earlier results into the prompt; unknown ids are refused", async () => {
  const repo = makeRepo();
  setScenario("ok");
  await startTask(repo, task("u-first", { context: ["src/a.txt"] }));
  await until(repo, "u-first");
  await recordReview(repo, { schema_version: "1.0", task_id: "u-first", decision: "ACCEPT", non_blocking_findings: ["naming ok"] });
  await assert.rejects(startTask(repo, task("u-bad", { related_tasks: ["nope-1"] })), /not found/);
  await startTask(repo, task("u-second", { context: ["src/a.txt"], related_tasks: ["u-first"] }));
  const prompt = fs.readFileSync(path.join(taskDir(repo, "u-second"), "prompts", "1.md"), "utf8");
  assert.match(prompt, /Already done by related tasks/);
  assert.match(prompt, /### u-first \(ACCEPTED\)/);
  assert.match(prompt, /Files changed: .*src\/new\.txt/);
  assert.match(prompt, /Worker summary: fake ok/);
  assert.match(prompt, /naming ok/);
  await until(repo, "u-second");
});

test("contract lint flags compressed goals, missing context and whole-repo scope", async () => {
  assert.deepEqual(gluedWords("strictoriginal capture, freshreadadmission and 855boundmetadata src/app/x.ts"), ["freshreadadmission", "855boundmetadata"]);
  const t = TaskContractSchema.parse(task("u-lint", {
    goal: "NEW SAMEcanonical scope/855boundmetadata; freshreadadmission, irreversiblelifetime anddualinternaldrain",
    scope: { allowed_paths: ["**"] },
  }));
  const w = lintContract(t);
  assert.ok(w.some((x) => /compressed/.test(x)), JSON.stringify(w));
  assert.ok(w.some((x) => /context is empty/.test(x)));
  assert.ok(w.some((x) => /whole repo/.test(x)));
  const clean = lintContract(TaskContractSchema.parse(task("u-clean", { context: ["src/a.txt"] })));
  assert.deepEqual(clean, []);
  const repo = makeRepo();
  setScenario("ok");
  const started: any = await startTask(repo, task("u-warn"));
  assert.ok(started.contract_warnings.some((x: string) => /context is empty/.test(x)));
  await until(repo, "u-warn");
});
