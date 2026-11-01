import { makeRepo, setScenario, task } from "./helpers.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { awaitTask, listTasks, startTask } from "../src/jobs.ts";
import { repoKey, taskDir } from "../src/paths.ts";

function writeLegacy(repo: string, id: string, state: string) {
  const dir = taskDir(repo, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({
    schema_version: "1.0", repo_path: repo, repo_key: repoKey(repo),
    task: { schema_version: "1.0", task_id: id, goal: `Legacy goal of ${id}`, scope: { allowed_paths: ["src/**"] } },
    state, branch_name: `gb/${id}`, worktree_path: path.join(repo, "..", "wt", id), retries: 0, rework_cycles: 1,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    changed_files: ["src/legacy.ts"],
    last_worker_envelope: { status: "SUCCESS", structured_output: { summary: "legacy worker summary" } },
  }));
}

test("V1.0 records are listed read-only and never break list/start/await", async () => {
  const repo = makeRepo();
  writeLegacy(repo, "GL-OLD-1", "ACCEPTED");
  writeLegacy(repo, "GL-OLD-2", "WORKER_COMPLETED");
  writeLegacy(repo, "GL-OLD-3", "RUNNING"); // stale RUNNING from V1.0 must not count as a running worker
  const list: any = await listTasks(repo);
  assert.equal(list.tasks.length, 0);
  assert.equal(list.legacy_v1_0.count, 3);
  assert.deepEqual(list.legacy_v1_0.states, { ACCEPTED: 1, WORKER_COMPLETED: 1, RUNNING: 1 });
  assert.deepEqual(list.legacy_v1_0.not_closed.map((t: any) => t.task_id).sort(), ["GL-OLD-2", "GL-OLD-3"]);
  await assert.rejects(awaitTask(repo, "GL-OLD-2", 0), /older GravityBridge \(V1\.0\)/);

  setScenario("ok");
  await startTask(repo, task("GL-NEW-1", { context: ["src/a.txt"], related_tasks: ["GL-OLD-1"] }));
  const prompt = fs.readFileSync(path.join(taskDir(repo, "GL-NEW-1"), "prompts", "1.md"), "utf8");
  assert.match(prompt, /### GL-OLD-1 \(ACCEPTED, GravityBridge V1\.0\)/);
  assert.match(prompt, /legacy worker summary/);
  for (let i = 0; i < 20; i++) {
    const s: any = await awaitTask(repo, "GL-NEW-1", 10);
    if (s.state !== "RUNNING") { assert.equal(s.state, "WORKER_COMPLETED"); break; }
  }
  const list2: any = await listTasks(repo);
  assert.equal(list2.tasks.length, 1);
});
