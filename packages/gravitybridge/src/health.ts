import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exists, readJson } from "./fsutil.js";
import { assertGitRepository, gitRun } from "./git.js";
import { gravityHome, repoRoot, resultSchemaPath, runningFromSource, siblingModule } from "./paths.js";
import { agyCommand, runProcess } from "./process.js";

export const HOOK_NAME = "gravitybridge-scope-guard";
export const PLUGIN_NAME = "codex-worker";

export function hooksFile(): string {
  return process.env.GRAVITYBRIDGE_HOOKS_FILE ?? path.join(os.homedir(), ".gemini", "config", "hooks.json");
}

export interface Check { ok: boolean | null; detail: string; fix?: string }

async function version(command: string, args: string[], shell = false): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await runProcess(command, args, { timeoutMs: 20_000, shell });
    return { ok: r.code === 0, out: (r.stdout || r.stderr).trim().split(/\r?\n/)[0] ?? "" };
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : String(e) };
  }
}

export async function healthChecks(repoPath?: string): Promise<Record<string, Check>> {
  const checks: Record<string, Check> = {};
  const major = Number(process.versions.node.split(".")[0]);
  checks.node = { ok: major >= 22, detail: `node ${process.versions.node}`, fix: major >= 22 ? undefined : "Install Node.js 22 or newer." };

  const git = await version("git", ["--version"]);
  checks.git = { ok: git.ok, detail: git.out, fix: git.ok ? undefined : "Install Git and make sure it is on PATH." };

  const agy = agyCommand();
  const av = await version(agy.command, [...agy.prefixArgs, "--version"]);
  checks.antigravity_cli = {
    ok: av.ok, detail: `${agy.command}: ${av.out}`,
    fix: av.ok ? undefined : "Install Antigravity CLI (agy) and sign in once by running `agy` in a terminal, or set GRAVITYBRIDGE_AGY to the full path of agy.",
  };

  const codex = await version("codex", ["--version"], process.platform === "win32");
  checks.codex_cli = { ok: codex.ok ? true : null, detail: codex.ok ? codex.out : "codex CLI not found (optional if you use the Codex app; add the MCP server manually)." };

  checks.result_schema = { ok: await exists(resultSchemaPath), detail: resultSchemaPath, fix: "Run scripts/setup to rebuild." };

  if (!runningFromSource) {
    const missing = [];
    for (const m of ["index", "runner", "hook"]) if (!(await exists(siblingModule(m)))) missing.push(m);
    checks.build = { ok: missing.length === 0, detail: missing.length ? `missing dist: ${missing.join(", ")}` : "dist ok", fix: "Run scripts/setup (npm ci && npm run build)." };
  }

  try {
    await fs.mkdir(gravityHome(), { recursive: true });
    const probe = path.join(gravityHome(), `.probe-${process.pid}`);
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
    checks.state_dir = { ok: true, detail: gravityHome() };
  } catch (e) {
    checks.state_dir = { ok: false, detail: `${gravityHome()}: ${String(e)}` };
  }

  try {
    const hooks = await readJson<Record<string, any>>(hooksFile());
    const entry = hooks?.[HOOK_NAME];
    const cmd: string = entry?.PreToolUse?.[0]?.hooks?.[0]?.command ?? "";
    const hookPath = /"([^"]*hook\.js)"/.exec(cmd)?.[1] ?? /(\S*hook\.js)/.exec(cmd)?.[1];
    const ok = Boolean(entry && entry.enabled !== false && hookPath && (await exists(hookPath)));
    checks.scope_hook = {
      ok, detail: ok ? `${hooksFile()} -> ${hookPath}` : `hook '${HOOK_NAME}' missing or points to a missing file in ${hooksFile()}`,
      fix: ok ? undefined : "Run scripts/setup again (it registers the hook).",
    };
  } catch (e) {
    checks.scope_hook = { ok: false, detail: `cannot read ${hooksFile()}: ${String(e)}`, fix: "Fix or delete the invalid hooks.json, then run scripts/setup." };
  }

  if (av.ok) {
    const r = await runProcess(agy.command, [...agy.prefixArgs, "plugin", "list", "--json"], { timeoutMs: 20_000 }).catch(() => null);
    const listed = r && r.code === 0 ? r.stdout.includes(PLUGIN_NAME) : null;
    checks.antigravity_plugin = {
      ok: listed,
      detail: listed === null ? "could not list plugins (check manually: agy plugin list)" : listed ? `${PLUGIN_NAME} installed` : `${PLUGIN_NAME} not installed`,
      fix: listed === false ? "Run scripts/setup again." : undefined,
    };
  }

  if (repoPath) {
    try {
      const top = await assertGitRepository(repoPath);
      const dirty = (await gitRun(top, ["status", "--porcelain"])).trim();
      checks.target_repo = {
        ok: !dirty, detail: dirty ? `${top}: has uncommitted changes (start_task will refuse)` : `${top}: clean`,
        fix: dirty ? "Commit or stash your changes before delegating." : undefined,
      };
    } catch (e) {
      checks.target_repo = { ok: false, detail: String(e instanceof Error ? e.message : e), fix: "Pass the path of a Git repository." };
    }
  }
  checks.framework_root = { ok: true, detail: repoRoot };
  return checks;
}

export function formatChecks(checks: Record<string, Check>): string {
  return Object.entries(checks)
    .map(([k, c]) => `${c.ok === true ? "[OK]  " : c.ok === null ? "[??]  " : "[FAIL]"} ${k}: ${c.detail}${c.fix && c.ok !== true ? `\n       -> ${c.fix}` : ""}`)
    .join("\n");
}
