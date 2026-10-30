/**
 * Cross-platform installer / doctor / smoke test.
 *   node dist/install.js            install everything (hook, Antigravity plugin, Codex skill, Codex MCP server)
 *   node dist/install.js --doctor   only run health checks
 *   node dist/install.js --smoke    run one tiny real task end-to-end with Antigravity
 * Flags: --skip-agy, --skip-codex, --dry-run
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exists, readJson, writeJsonAtomic } from "./fsutil.js";
import { formatChecks, healthChecks, HOOK_NAME, hooksFile, PLUGIN_NAME } from "./health.js";
import { awaitTask, cleanupTask, getTask, recordReview, startTask } from "./jobs.js";
import { gravityHome, repoRoot, siblingModule, taskDir } from "./paths.js";
import { agyCommand, runProcess } from "./process.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const log = (s: string) => console.log(s);

function q(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** Quote only when needed: a command line that *starts* with a quote breaks under cmd.exe and PowerShell. */
function arg(s: string): string {
  return /[\s"]/.test(s) ? q(s) : s;
}

export function hookCommand(): string {
  const home = process.env.GRAVITYBRIDGE_HOME ? ` --home ${arg(gravityHome())}` : "";
  return `node ${arg(siblingModule("hook"))}${home}`;
}

export async function installHook(file = hooksFile()): Promise<string> {
  let hooks: Record<string, unknown> = {};
  if (await exists(file)) {
    try {
      hooks = (await readJson<Record<string, unknown>>(file)) ?? {};
    } catch {
      throw new Error(`${file} is not valid JSON. Fix it (or rename it) and run setup again; it was NOT modified.`);
    }
    if (!dryRun) await fs.copyFile(file, `${file}.bak-${Date.now()}`);
  }
  hooks[HOOK_NAME] = {
    PreToolUse: [{
      matcher: "write_to_file|replace_file_content|multi_replace_file_content|run_command",
      hooks: [{ type: "command", command: hookCommand(), timeout: 20 }],
    }],
  };
  if (!dryRun) await writeJsonAtomic(file, hooks);
  return file;
}

async function run(cmd: string, argv: string[], shell = false) {
  const line = [cmd, ...argv].join(" ");
  if (dryRun) { log(`  (dry-run) ${line}`); return { code: 0, stdout: "", stderr: "" }; }
  const finalCmd = shell ? [cmd, ...argv].map(arg).join(" ") : cmd;
  const r = await runProcess(finalCmd, shell ? [] : argv, { timeoutMs: 180_000, shell });
  return r;
}

async function installPlugin(): Promise<void> {
  const agy = agyCommand();
  const plugin = path.join(repoRoot, "antigravity-plugin", PLUGIN_NAME);
  await run(agy.command, [...agy.prefixArgs, "plugin", "uninstall", PLUGIN_NAME]).catch(() => undefined);
  const r = await run(agy.command, [...agy.prefixArgs, "plugin", "install", plugin]);
  if (r.code !== 0) throw new Error(`agy plugin install failed: ${(r.stderr || r.stdout).trim()}`);
  log(`[OK] Antigravity plugin installed: ${plugin}`);
}

async function installCodexSkill(): Promise<void> {
  const src = path.join(repoRoot, "skills", "antigravity-orchestration");
  const dest = path.join(os.homedir(), ".agents", "skills", "antigravity-orchestration");
  if (!dryRun) {
    await fs.rm(dest, { recursive: true, force: true });
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.cp(src, dest, { recursive: true });
  }
  log(`[OK] Codex skill copied to ${dest}`);
}

async function installCodexMcp(): Promise<void> {
  const win = process.platform === "win32";
  const server = siblingModule("index");
  const probe = await runProcess("codex", ["--version"], { timeoutMs: 20_000, shell: win }).catch(() => null);
  if (!probe || probe.code !== 0) {
    log(`[WARN] codex CLI not found. Add this to ~/.codex/config.toml manually:\n\n[mcp_servers.gravitybridge]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(server)}]\ntool_timeout_sec = 120\n`);
    return;
  }
  await run("codex", ["mcp", "remove", "gravitybridge"], win).catch(() => undefined);
  const r = await run("codex", ["mcp", "add", "gravitybridge", "--", process.execPath, server], win);
  if (r.code !== 0) throw new Error(`codex mcp add failed: ${(r.stderr || r.stdout).trim()}`);
  log(`[OK] Codex MCP server 'gravitybridge' registered -> ${server}`);
  log("     Tip: GravityBridge tools return within ~50s, so the default Codex tool timeout (60s) is enough.");
}

async function install(): Promise<void> {
  log("== GravityBridge install ==");
  if (!args.has("--skip-agy")) {
    log(`[OK] Scope hook registered in ${await installHook()}`);
    await installPlugin();
  }
  if (!args.has("--skip-codex")) {
    await installCodexSkill();
    await installCodexMcp();
  }
  log("\n== Health ==");
  const checks = await healthChecks();
  log(formatChecks(checks));
  log("\nNext: restart Codex, then run the smoke test:  node packages/gravitybridge/dist/install.js --smoke");
}

async function smoke(): Promise<number> {
  const g = (cwd: string, ...a: string[]) =>
    runProcess("git", ["-c", "user.name=GravityBridge", "-c", "user.email=gb@localhost", "-C", cwd, ...a], { timeoutMs: 60_000 });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gb-smoke-"));
  await g(dir, "init", "-q");
  await fs.mkdir(path.join(dir, "src"));
  await fs.writeFile(path.join(dir, "README.md"), "# smoke\n");
  await fs.writeFile(path.join(dir, "src", ".keep"), "");
  await g(dir, "add", "-A");
  await g(dir, "commit", "-q", "-m", "init");
  const id = `smoke-${Date.now()}`;
  log(`Smoke repo: ${dir}\nStarting task ${id} (this uses Antigravity for real; usually 1-5 minutes)...`);
  const check = `node -e "process.exit(require('fs').readFileSync('src/greeting.txt','utf8').trim()==='hello from gravitybridge'?0:1)"`;
  await startTask(dir, {
    schema_version: "1.0",
    task_id: id,
    type: "smoke",
    goal: "Create the file src/greeting.txt whose entire content is the single line: hello from gravitybridge",
    scope: { allowed_paths: ["src/**"] },
    acceptance_criteria: ["src/greeting.txt exists and contains exactly 'hello from gravitybridge'", "No other file is changed"],
    validation_commands: [check],
    worker: { agent: "gb-coder", effort: "low", print_timeout: "10m" },
  });
  let s: any;
  const until = Date.now() + 20 * 60_000;
  do {
    s = await awaitTask(dir, id, 45);
    log(`  state=${s.state}${s.progress ? ` elapsed=${s.progress.elapsed_seconds}s steps=${s.progress.recent_steps} last_tool=${s.progress.last_tool ?? "-"}` : ""}`);
  } while (s.state === "RUNNING" && Date.now() < until);
  const full: any = await getTask(dir, id);
  const hookLog = await fs.readFile(path.join(taskDir(dir, id), "hook.log"), "utf8").catch(() => "");
  const results: [string, boolean][] = [
    ["worker completed", full.state === "WORKER_COMPLETED"],
    ["created src/greeting.txt", full.changed_files.some((f: string) => f.endsWith("src/greeting.txt"))],
    ["no scope violations", full.scope_violations.length === 0],
    ["bridge validation passed", full.latest_turn?.bridge_validation_passed === true],
    ["scope hook was called by Antigravity", hookLog.trim().length > 0],
  ];
  log("\n== Smoke result ==");
  for (const [name, ok] of results) log(`${ok ? "[OK]  " : "[FAIL]"} ${name}`);
  if (!results.every(([, ok]) => ok)) {
    log("\nDetails (send this to your assistant):");
    log(JSON.stringify({ ...full, hook_log: hookLog.split("\n").slice(-10) }, null, 2).slice(0, 12_000));
  }
  if (results.every(([, ok]) => ok)) {
    try {
      await recordReview(dir, { schema_version: "1.0", task_id: id, decision: "REJECT", blocking_findings: [], non_blocking_findings: ["smoke test"] });
      await cleanupTask(dir, id, true);
    } catch { /* keep evidence */ }
  }
  return results.every(([, ok]) => ok) ? 0 : 1;
}

async function main(): Promise<number> {
  if (args.has("--doctor")) {
    const checks = await healthChecks(process.argv.find((a, i) => i > 1 && !a.startsWith("--")));
    log(formatChecks(checks));
    return Object.values(checks).some((c) => c.ok === false) ? 1 : 0;
  }
  if (args.has("--smoke")) return await smoke();
  await install();
  return 0;
}

const invokedDirectly = process.argv[1] && /install\.(js|ts)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().then((code) => process.exit(code), (e) => { console.error(`[FAIL] ${e instanceof Error ? e.message : e}`); process.exit(1); });
}
