import { makeRepo, setScenario, task } from "./helpers.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { decide } from "../src/hook.ts";
import { awaitTask, startTask } from "../src/jobs.ts";

const hookFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "hook.ts");

test("hook: no effect outside GravityBridge worktrees", async () => {
  const r = await decide({ workspacePaths: ["/somewhere/else"], toolCall: { name: "write_to_file", args: { TargetFile: "/etc/passwd" } } });
  assert.equal(r.verdict.decision, "allow");
});

test("hook: enforces scope and command policy inside a task worktree", async () => {
  const repo = makeRepo();
  setScenario("blocked");
  const s: any = await startTask(repo, task("t-hook", { allowed_commands: ["npm run lint"] }));
  const wt = s.worktree;
  for (let i = 0; i < 20 && (await awaitTask(repo, "t-hook", 5) as any).state === "RUNNING"; i++);
  const call = async (name: string, args: Record<string, unknown>) =>
    (await decide({ workspacePaths: [wt], toolCall: { name, args } })).verdict.decision;
  assert.equal(await call("write_to_file", { TargetFile: path.join(wt, "src", "ok.ts") }), "allow");
  assert.equal(await call("write_to_file", { TargetFile: "src/rel.ts" }), "allow");
  assert.equal(await call("replace_file_content", { TargetFile: path.join(wt, "server", "x.txt") }), "deny");
  assert.equal(await call("write_to_file", { TargetFile: path.join(wt, "AGENTS.md") }), "deny");
  assert.equal(await call("write_to_file", { TargetFile: path.join(wt, "..", "escape.txt") }), "deny");
  assert.equal(await call("multi_replace_file_content", { TargetFile: path.join(wt, ".git", "config") }), "deny");
  assert.equal(await call("run_command", { CommandLine: "git commit -am x", Cwd: wt }), "deny");
  assert.equal(await call("run_command", { CommandLine: "git -C . checkout main", Cwd: wt }), "deny");
  assert.equal(await call("run_command", { CommandLine: "npm run lint", Cwd: wt }), "auto_approve");
  assert.equal(await call("run_command", { CommandLine: "git status", Cwd: wt }), "auto_approve");
  assert.equal(await call("run_command", { CommandLine: "ls", Cwd: "/" }), "deny");
  assert.equal(await call("run_command", { CommandLine: "ls -la", Cwd: wt }), "allow");
  assert.equal(await call("view_file", { AbsolutePath: "/etc/hosts" }), "allow");

  // The real executable speaks the stdin/stdout JSON protocol.
  const out = spawnSync(process.execPath, ["--import", "tsx", hookFile], {
    input: JSON.stringify({ workspacePaths: [wt], toolCall: { name: "write_to_file", args: { TargetFile: path.join(wt, "server", "y.txt") } } }),
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).decision, "deny");
});
