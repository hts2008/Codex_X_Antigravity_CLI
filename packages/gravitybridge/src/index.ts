import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { healthChecks } from "./health.js";
import {
  awaitTask, cancelTask, cleanupTask, continueTask, getTask, getTaskDiff, getTaskEvents, getWorkerResult, listTasks,
  recordReview, retryTask, startTask,
} from "./jobs.js";
import { ReviewSchema, TaskContractSchema } from "./types.js";

export const VERSION = "1.1.0";

function response(value: unknown) {
  const structured = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : { value };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: structured,
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `GravityBridge error: ${message}` }], isError: true };
}

/** Wrap a handler so expected errors come back as readable tool errors instead of protocol failures. */
function safe<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return response(await fn(args));
    } catch (error) {
      return failure(error);
    }
  };
}

const repo = z.string().min(1).describe("Absolute path of the target Git repository (the main checkout, not the worktree).");
const taskId = z.string().min(1);

export function createServer(): McpServer {
  const server = new McpServer({ name: "gravitybridge", version: VERSION });

  server.registerTool("start_task", {
    title: "Start an Antigravity coding task (async)",
    description:
      "Validate the Task Contract, create an isolated worktree on branch gb/<task_id> from the current clean HEAD, and start the Antigravity worker in the background. Returns immediately with state RUNNING. Then call await_task.",
    inputSchema: z.object({ repo_path: repo, task: TaskContractSchema }),
  }, safe(async ({ repo_path, task }) => await startTask(repo_path, task)));

  server.registerTool("await_task", {
    title: "Wait for a task to change state",
    description:
      "Long-poll up to wait_seconds (max 50) for a RUNNING task to finish. Returns a compact summary: state, next_action, changed files, scope violations, worker claims vs evidence, bridge validation results. Call repeatedly while state is RUNNING.",
    inputSchema: z.object({ repo_path: repo, task_id: taskId, wait_seconds: z.number().int().min(0).max(50).default(45) }),
  }, safe(async ({ repo_path, task_id, wait_seconds }) => await awaitTask(repo_path, task_id, wait_seconds)));

  server.registerTool("continue_task", {
    title: "Continue a task with Codex instructions",
    description:
      "Start the next worker turn in the same worktree/conversation. Use after record_review REWORK (state CHANGES_REQUESTED; feedback optional, defaults to blocking_findings) or to answer a BLOCKED worker (feedback required).",
    inputSchema: z.object({ repo_path: repo, task_id: taskId, feedback: z.string().max(8_000).optional() }),
  }, safe(async ({ repo_path, task_id, feedback }) => await continueTask(repo_path, task_id, feedback)));

  server.registerTool("retry_task", {
    title: "Retry a failed or canceled execution",
    description:
      "Re-run a WORKER_FAILED or CANCELED task in the same worktree. Enforces max_retries and refuses when the same failure repeated twice (then fix the cause or TAKEOVER).",
    inputSchema: z.object({ repo_path: repo, task_id: taskId }),
  }, safe(async ({ repo_path, task_id }) => await retryTask(repo_path, task_id)));

  server.registerTool("cancel_task", {
    title: "Cancel a running task",
    description: "Stop the running worker turn (graceful, then forced after 15s). Keeps the worktree and partial changes.",
    inputSchema: z.object({ repo_path: repo, task_id: taskId }),
  }, safe(async ({ repo_path, task_id }) => await cancelTask(repo_path, task_id)));

  server.registerTool("get_task", {
    title: "Get task details",
    description: "Full task status: contract essentials, all turns, last review, budgets, progress if running.",
    inputSchema: z.object({ repo_path: repo, task_id: taskId }),
  }, safe(async ({ repo_path, task_id }) => await getTask(repo_path, task_id)));

  server.registerTool("list_tasks", {
    title: "List tasks",
    description: "List GravityBridge tasks (optionally for one repository) with state and next action. Use at session start to recover work.",
    inputSchema: z.object({ repo_path: repo.optional(), include_closed: z.boolean().default(false) }),
  }, safe(async ({ repo_path, include_closed }) => await listTasks(repo_path, include_closed)));

  server.registerTool("get_task_diff", {
    title: "Get the real Git diff of a task",
    description:
      "Diff from git evidence (includes new files). range=cumulative (base..branch) or last_turn; mode=stat (default, cheap) or full; optional path filter; output capped by max_bytes.",
    inputSchema: z.object({
      repo_path: repo, task_id: taskId,
      range: z.enum(["cumulative", "last_turn"]).default("cumulative"),
      mode: z.enum(["stat", "full"]).default("stat"),
      path: z.string().optional(),
      max_bytes: z.number().int().min(1_000).max(400_000).default(60_000),
    }),
  }, safe(async ({ repo_path, task_id, ...opts }) => await getTaskDiff(repo_path, task_id, opts)));

  server.registerTool("get_task_events", {
    title: "Get recent worker events",
    description: "Tail of the Antigravity stream-json event log (for debugging failures or watching progress).",
    inputSchema: z.object({
      repo_path: repo, task_id: taskId,
      count: z.number().int().min(1).max(500).default(40),
      max_bytes: z.number().int().min(1_000).max(200_000).default(30_000),
    }),
  }, safe(async ({ repo_path, task_id, count, max_bytes }) => await getTaskEvents(repo_path, task_id, count, max_bytes)));

  server.registerTool("get_worker_result", {
    title: "Get a full turn result",
    description: "Full evidence of one turn (default: latest): worker structured result, setup/validation output, claim checks, permission notices.",
    inputSchema: z.object({ repo_path: repo, task_id: taskId, turn: z.number().int().min(1).optional() }),
  }, safe(async ({ repo_path, task_id, turn }) => await getWorkerResult(repo_path, task_id, turn)));

  server.registerTool("record_review", {
    title: "Record the Codex review decision",
    description:
      "ACCEPT (blocked if scope violations; needs override_reason if bridge validation failed), REWORK (needs blocking_findings; then continue_task), REJECT, or TAKEOVER. Worker completion is never acceptance.",
    inputSchema: z.object({ repo_path: repo, review: ReviewSchema }),
  }, safe(async ({ repo_path, review }) => await recordReview(repo_path, review)));

  server.registerTool("cleanup_task", {
    title: "Remove a finished task's worktree",
    description:
      "For ACCEPTED/REJECTED/CODEX_TAKEOVER tasks: remove the worktree. Keeps the branch unless delete_branch=true (only delete after integrating). Evidence files are kept.",
    inputSchema: z.object({ repo_path: repo, task_id: taskId, delete_branch: z.boolean().default(false) }),
  }, safe(async ({ repo_path, task_id, delete_branch }) => await cleanupTask(repo_path, task_id, delete_branch)));

  server.registerTool("worker_health", {
    title: "Check GravityBridge health",
    description: "Check prerequisites without running a model: Node, Git, Antigravity CLI, plugin, scope hook, state dir, optional target repo.",
    inputSchema: z.object({ repo_path: repo.optional() }),
  }, safe(async ({ repo_path }) => await healthChecks(repo_path)));

  return server;
}

const invokedDirectly = process.argv[1] && /index\.(js|ts)$/.test(process.argv[1]);
if (invokedDirectly) {
  void serveStdio(createServer);
  console.error(`GravityBridge MCP server ${VERSION} running on stdio`);
}
