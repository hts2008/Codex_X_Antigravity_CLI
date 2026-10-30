#!/usr/bin/env node
// Fake Antigravity CLI for tests. Behaviour is selected with FAKE_AGY_SCENARIO.
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
if (argv[0] === "--version") { console.log("fake-agy 0.0.0"); process.exit(0); }
if (argv[0] === "plugin") { console.log(argv[1] === "list" ? JSON.stringify([{ name: "codex-worker" }]) : "ok"); process.exit(0); }
if (!argv.includes("-p")) { process.stderr.write("fake-agy: unsupported invocation\n"); process.exit(2); }
const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
const prompt = get("-p") ?? "";
const taskId = /task_id exactly "([^"]+)"/.exec(prompt)?.[1] ?? "unknown";
const conversation = get("--conversation") ?? `conv-${process.pid}`;
const scenario = process.env.FAKE_AGY_SCENARIO ?? "ok";
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const write = (rel, content) => { fs.mkdirSync(path.dirname(rel), { recursive: true }); fs.writeFileSync(rel, content); };
const tool = (name) => emit({ event: "step_update", step_update: { step_type: "tool", state: "DONE", tool_name: name, tool_info: { name } } });
const result = (structured, status = "SUCCESS") => emit({
  event: "result",
  result: { conversation_id: conversation, status, response: "done", structured_output: structured, usage: { input_tokens: 10 } },
});
const base = (over = {}) => ({
  schema_version: "1.0", task_id: taskId, worker_status: "completed", summary: `fake ${scenario}`,
  files_changed: [], commands_run: [], validation: {}, assumptions: [], known_issues: [], blockers: [], recommendations: [], ...over,
});

emit({ event: "init", conversation_id: conversation, permission_mode: "request-review" });
if (process.env.FAKE_AGY_ARGS_LOG) fs.appendFileSync(process.env.FAKE_AGY_ARGS_LOG, JSON.stringify({ argv, cwd: process.cwd() }) + "\n");

switch (scenario) {
  case "ok":
    write("src/new.txt", "new file\n");
    fs.appendFileSync("src/a.txt", "changed\n");
    tool("write_to_file");
    result(base({ files_changed: ["src/new.txt", "src/a.txt"] }));
    break;
  case "smoke":
    write("src/greeting.txt", "hello from gravitybridge\n");
    result(base({ files_changed: ["src/greeting.txt"] }));
    break;
  case "forbidden":
    write("src/new.txt", "new file\n");
    write("server/secret.txt", "oops\n");
    tool("write_to_file");
    result(base({ files_changed: ["src/new.txt"] }));
    break;
  case "rework":
    fs.rmSync("server/secret.txt", { force: true });
    write("src/fix.txt", "fixed\n");
    result(base({ files_changed: ["src/fix.txt", "server/secret.txt"] }));
    break;
  case "blocked":
    result(base({ worker_status: "blocked", blockers: [{ type: "decision", question: "Which color?", options: ["red", "blue"], evidence: [] }] }));
    break;
  case "invalid":
    result({ schema_version: "1.0", task_id: taskId });
    break;
  case "crash":
    process.stderr.write("fatal: something broke\n");
    process.exit(3);
    break;
  case "slow":
    write("src/partial.txt", "partial\n");
    setTimeout(() => result(base({ files_changed: ["src/partial.txt"] })), 120_000);
    break;
  default:
    process.stderr.write(`unknown scenario ${scenario}\n`);
    process.exit(2);
}
