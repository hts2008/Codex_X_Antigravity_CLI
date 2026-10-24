/**
 * Antigravity PreToolUse hook (registered globally in ~/.gemini/config/hooks.json by install.js).
 * - Outside GravityBridge worktrees it always answers "allow" (no effect on normal agy use).
 * - Inside a GravityBridge worktree it enforces the task contract BEFORE a tool runs:
 *   file writes outside the worktree / scope are denied, mutating git commands are denied,
 *   validation/allowed commands are auto-approved.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { locateWorktree, taskDirByKey } from "./paths.js";
import { scopeViolation } from "./scope.js";
import { loadTaskRecordByKey } from "./store.js";

type Decision = "allow" | "auto_approve" | "deny";
interface Verdict { decision: Decision; reason?: string }

const WRITE_TOOLS = new Set(["write_to_file", "replace_file_content", "multi_replace_file_content"]);
const GIT_MUTATING = /(^|[\s;&|(])git(\s+-[^\s]+(\s+[^\s-][^\s]*)?)*\s+(commit|push|merge|rebase|reset|checkout|switch|branch|worktree|stash|tag|cherry-pick|revert|clean|restore|am|apply|pull|fetch|remote|update-ref|filter-branch|gc|prune|config)\b/i;
const GIT_READONLY = /^git\s+(status|diff|log|show)(\s|$)/i;

function normalizeCommand(c: string): string {
  return c.trim().replace(/\s+/g, " ");
}

function isInside(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function decide(input: any): Promise<{ verdict: Verdict; logDir?: string }> {
  const ws: string | undefined = Array.isArray(input?.workspacePaths) && typeof input.workspacePaths[0] === "string"
    ? input.workspacePaths[0]
    : undefined;
  const loc = ws ? locateWorktree(ws) : null;
  if (!loc) return { verdict: { decision: "allow" } };
  const logDir = taskDirByKey(loc.key, loc.taskId);
  const name: string = input?.toolCall?.name ?? "";
  const args = input?.toolCall?.args ?? {};
  const record = await loadTaskRecordByKey(loc.key, loc.taskId);
  if (!record) {
    return { logDir, verdict: WRITE_TOOLS.has(name) ? { decision: "deny", reason: "GravityBridge: task record not found for this worktree." } : { decision: "allow" } };
  }
  const t = record.task;
  const wt = loc.worktree;

  if (WRITE_TOOLS.has(name)) {
    const target = typeof args.TargetFile === "string" ? args.TargetFile : "";
    if (!target) return { logDir, verdict: { decision: "deny", reason: "GravityBridge: missing TargetFile." } };
    const abs = path.resolve(wt, target);
    if (!isInside(wt, abs)) return { logDir, verdict: { decision: "deny", reason: `GravityBridge: ${target} is outside the task worktree.` } };
    const rel = path.relative(wt, abs);
    const v = scopeViolation(rel, { ...t.scope, mutating: t.mutating });
    if (v) return { logDir, verdict: { decision: "deny", reason: `GravityBridge scope guard: ${v}. Allowed: ${t.scope.allowed_paths.join(", ")}. If you truly need this file, stop and report it as a blocker.` } };
    return { logDir, verdict: { decision: "allow" } };
  }

  if (name === "run_command") {
    const cmd = normalizeCommand(String(args.CommandLine ?? ""));
    const cwd = typeof args.Cwd === "string" && args.Cwd ? path.resolve(wt, args.Cwd) : wt;
    if (!isInside(wt, cwd)) return { logDir, verdict: { decision: "deny", reason: "GravityBridge: commands must run inside the task worktree." } };
    if (GIT_MUTATING.test(cmd)) {
      return { logDir, verdict: { decision: "deny", reason: "GravityBridge: git commands that change history/branches/config are not allowed. Your work is snapshotted automatically." } };
    }
    const approved = new Set([...t.validation_commands, ...t.allowed_commands].map(normalizeCommand));
    if (approved.has(cmd) || (GIT_READONLY.test(cmd) && !/[;&|<>`$]/.test(cmd))) {
      return { logDir, verdict: { decision: "auto_approve", reason: "GravityBridge: pre-approved by the task contract." } };
    }
    return { logDir, verdict: { decision: "allow" } };
  }
  return { logDir, verdict: { decision: "allow" } };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const homeIdx = process.argv.indexOf("--home");
  if (homeIdx > 0 && process.argv[homeIdx + 1]) process.env.GRAVITYBRIDGE_HOME = process.argv[homeIdx + 1];
  let input: any = {};
  let verdict: Verdict;
  let logDir: string | undefined;
  try {
    input = JSON.parse((await readStdin()) || "{}");
    ({ verdict, logDir } = await decide(input));
  } catch (e) {
    // Fail closed only for writes inside a GravityBridge worktree; never break normal agy use.
    const ws = input?.workspacePaths?.[0];
    const inGb = typeof ws === "string" && locateWorktree(ws);
    verdict = inGb && WRITE_TOOLS.has(input?.toolCall?.name)
      ? { decision: "deny", reason: `GravityBridge hook error: ${e instanceof Error ? e.message : String(e)}` }
      : { decision: "allow" };
  }
  if (logDir) {
    const entry = {
      at: new Date().toISOString(), tool: input?.toolCall?.name,
      target: input?.toolCall?.args?.TargetFile ?? input?.toolCall?.args?.CommandLine, ...verdict,
    };
    await fs.appendFile(path.join(logDir, "hook.log"), JSON.stringify(entry) + "\n", "utf8").catch(() => undefined);
  }
  process.stdout.write(JSON.stringify(verdict));
}

const invokedDirectly = process.argv[1] && /hook\.(js|ts)$/.test(process.argv[1]);
if (invokedDirectly) void main();
