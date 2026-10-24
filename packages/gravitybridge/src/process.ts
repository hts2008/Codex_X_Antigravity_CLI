import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { tail } from "./fsutil.js";
import type { CommandResult } from "./types.js";

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const MAX_CAPTURE = 2_000_000;

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; shell?: boolean } = {},
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: options.shell ?? false,
      env: options.env ?? process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => { timedOut = true; killTree(child); }, options.timeoutMs)
      : undefined;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => { stdout = (stdout + c).slice(-MAX_CAPTURE); });
    child.stderr.on("data", (c: string) => { stderr = (stderr + c).slice(-MAX_CAPTURE); });
    child.on("error", (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Run a shell command line (task setup/validation). Output is captured and truncated. */
export async function runShellCommand(
  commandLine: string,
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const started = Date.now();
  try {
    const r = await runProcess(commandLine, [], { cwd, timeoutMs, env, shell: true });
    return {
      command: commandLine,
      exit_code: r.code,
      timed_out: r.timedOut,
      duration_seconds: Math.round((Date.now() - started) / 100) / 10,
      output_tail: tail(`${r.stdout}${r.stderr ? `\n[stderr]\n${r.stderr}` : ""}`.trim(), 4_000),
    };
  } catch (error) {
    return {
      command: commandLine,
      exit_code: null,
      timed_out: false,
      duration_seconds: Math.round((Date.now() - started) / 100) / 10,
      output_tail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Kill a process and all of its children. POSIX children must be spawned with detached:true. */
export function killTree(child: ChildProcess | number, signal: NodeJS.Signals = "SIGTERM"): void {
  const pid = typeof child === "number" ? child : child.pid;
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try { process.kill(pid, signal); } catch { /* already gone */ }
  }
}

export function isAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * How to launch Antigravity. GRAVITYBRIDGE_AGY may point to an absolute agy executable,
 * or to a .js/.mjs file (used by tests with a fake worker).
 */
export function agyCommand(): { command: string; prefixArgs: string[] } {
  const configured = process.env.GRAVITYBRIDGE_AGY;
  if (!configured) return { command: "agy", prefixArgs: [] };
  const ext = path.extname(configured).toLowerCase();
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return { command: process.execPath, prefixArgs: [configured] };
  }
  return { command: configured, prefixArgs: [] };
}
