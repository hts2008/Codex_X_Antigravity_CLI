import path from "node:path";
import { access } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { cancelActiveWorker } from "./agy.js";
import { assertGitRepository, taskDiff } from "./git.js";
import { delegateAndWait, continueTask } from "./orchestrator.js";
import { executable, runProcess } from "./process.js";
import { resultSchemaPath } from "./paths.js";
import {
  loadTaskRecord,
  readEvents,
  readWorkerResult,
  saveReview,
  saveTaskRecord,
} from "./store.js";
import { ReviewSchema, TaskContractSchema } from "./types.js";

const server = new McpServer({
  name: "gravitybridge",
  version: "1.0.0",
});

function response(value: unknown) {
  const structured = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : { value };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: structured,
  };
}

server.registerTool(
  "delegate_and_wait",
  {
    title: "Delegate task to Antigravity and wait",
    description:
      "Create an isolated Git worktree, execute one bounded Antigravity CLI task in headless stream-json mode, wait for its terminal result, persist evidence, and return control to Codex. Worker completion is not acceptance.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      task: TaskContractSchema,
    }),
  },
  async ({ repo_path, task }) => response(await delegateAndWait(repo_path, task)),
);

server.registerTool(
  "continue_task",
  {
    title: "Continue Antigravity task with Codex feedback",
    description:
      "Resume the same Antigravity conversation and worktree for targeted rework after Codex review or a resolvable blocker. Preserves prior worker context.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      task_id: z.string().min(1),
      feedback: z.string().min(5).max(30_000),
    }),
  },
  async ({ repo_path, task_id, feedback }) => response(await continueTask(repo_path, task_id, feedback)),
);

server.registerTool(
  "get_task",
  {
    title: "Get GravityBridge task",
    description: "Read the persisted orchestration metadata for one task.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      task_id: z.string().min(1),
    }),
  },
  async ({ repo_path, task_id }) => response(await loadTaskRecord(path.resolve(repo_path), task_id)),
);

server.registerTool(
  "get_task_events",
  {
    title: "Get Antigravity execution events",
    description:
      "Read the tail of the persisted Antigravity stream-json event trace for a task. Use this when Codex needs execution evidence beyond the final worker result.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      task_id: z.string().min(1),
      tail: z.number().int().min(1).max(2000).default(200),
    }),
  },
  async ({ repo_path, task_id, tail }) => response({
    task_id,
    events: await readEvents(path.resolve(repo_path), task_id, tail),
  }),
);

server.registerTool(
  "get_worker_result",
  {
    title: "Get worker result",
    description:
      "Read GravityBridge's persisted worker result bundle, including Antigravity terminal envelope, conversation ID, changed files, worktree status, and stderr.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      task_id: z.string().min(1),
    }),
  },
  async ({ repo_path, task_id }) => response(await readWorkerResult(path.resolve(repo_path), task_id)),
);

server.registerTool(
  "get_task_diff",
  {
    title: "Get delegated task Git diff",
    description:
      "Return the current Git diff from the task's isolated worktree against its recorded base SHA. Codex should inspect this before accepting mutating work.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      task_id: z.string().min(1),
    }),
  },
  async ({ repo_path, task_id }) => {
    const record = await loadTaskRecord(path.resolve(repo_path), task_id);
    return response({
      task_id,
      base_sha: record.task.base_sha,
      worktree_path: record.worktree_path,
      changed_files: record.changed_files ?? [],
      diff: await taskDiff(record.worktree_path, record.task.base_sha),
    });
  },
);

server.registerTool(
  "record_review",
  {
    title: "Record Codex review decision",
    description:
      "Persist Codex's independent review decision. ACCEPT marks the task accepted but does not merge; REWORK enables continue_task; REJECT/TAKEOVER prevent further worker authority.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      review: ReviewSchema,
    }),
  },
  async ({ repo_path, review }) => {
    const resolved = path.resolve(repo_path);
    const record = await loadTaskRecord(resolved, review.task_id);

    if (!["WORKER_COMPLETED", "BLOCKED", "REVIEW_PENDING", "CODEX_REVIEWING"].includes(record.state)) {
      throw new Error(`Cannot record review for task ${review.task_id} from state ${record.state}.`);
    }

    if (review.decision === "ACCEPT") record.state = "ACCEPTED";
    if (review.decision === "REWORK") record.state = "CHANGES_REQUESTED";
    if (review.decision === "REJECT") record.state = "REJECTED";
    if (review.decision === "TAKEOVER") record.state = "CODEX_TAKEOVER";

    await saveReview(resolved, review.task_id, review);
    await saveTaskRecord(record);
    return response(record);
  },
);

server.registerTool(
  "cancel_task",
  {
    title: "Cancel active Antigravity worker",
    description:
      "Request cancellation of an active Antigravity child process for a task. Cancellation is best-effort and does not delete the worktree or partial changes.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
      task_id: z.string().min(1),
    }),
  },
  async ({ repo_path, task_id }) => response({
    task_id,
    cancellation_requested: cancelActiveWorker(path.resolve(repo_path), task_id),
  }),
);

server.registerTool(
  "worker_health",
  {
    title: "Check GravityBridge worker health",
    description:
      "Check local prerequisites for orchestration without starting a model task: Git, Node, Antigravity CLI, target repository, and result schema availability.",
    inputSchema: z.object({
      repo_path: z.string().min(1),
    }),
  },
  async ({ repo_path }) => {
    const resolved = await assertGitRepository(path.resolve(repo_path));
    const checks: Record<string, unknown> = { repo_path: resolved };

    for (const name of ["git", "node", "agy"]) {
      try {
        const command = executable(name);
        const r = await runProcess(command, ["--version"], { cwd: resolved, timeoutMs: 15_000 });
        checks[name] = {
          ok: r.code === 0,
          version: (r.stdout || r.stderr).trim(),
        };
      } catch (error) {
        checks[name] = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    try {
      await access(resultSchemaPath);
      checks.result_schema = { ok: true, path: resultSchemaPath };
    } catch (error) {
      checks.result_schema = { ok: false, path: resultSchemaPath, error: String(error) };
    }

    return response(checks);
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("GravityBridge fatal error:", error);
  process.exitCode = 1;
});
