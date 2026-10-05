import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { executable } from "./process.js";
import { resultSchemaPath } from "./paths.js";
import { appendEvent, appendStderr } from "./store.js";
import type { TaskContract, WorkerEnvelope } from "./types.js";

const active = new Map<string, ChildProcessWithoutNullStreams>();

function key(repoPath: string, taskId: string): string {
  return `${repoPath}::${taskId}`;
}

export function cancelActiveWorker(repoPath: string, taskId: string): boolean {
  const child = active.get(key(repoPath, taskId));
  if (!child) return false;
  child.kill();
  return true;
}

export async function runAntigravityTurn(args: {
  repoPath: string;
  task: TaskContract;
  worktreePath: string;
  prompt: string;
  conversationId?: string;
}): Promise<{ exitCode: number; envelope?: WorkerEnvelope; stderr: string }> {
  const command = executable("agy");
  const cliArgs = [
    "-p", args.prompt,
    "--output-format", "stream-json",
    "--json-schema", resultSchemaPath,
    "--effort", args.task.worker.effort,
    "--agent", args.task.worker.agent,
    "--print-timeout", args.task.worker.print_timeout,
  ];

  if (args.task.worker.model) cliArgs.push("--model", args.task.worker.model);
  if (args.conversationId) cliArgs.push("--conversation", args.conversationId);

  const child = spawn(command, cliArgs, {
    cwd: args.worktreePath,
    windowsHide: true,
    shell: false,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  active.set(key(args.repoPath, args.task.task_id), child);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let terminal: WorkerEnvelope | undefined;
  let stderr = "";

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });

  const stdoutDone = (async () => {
    for await (const line of rl) {
      if (!line.trim()) continue;
      await appendEvent(args.repoPath, args.task.task_id, line);
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event.event === "result" && event.result && typeof event.result === "object") {
          terminal = event.result as WorkerEnvelope;
        }
      } catch {
        await appendEvent(
          args.repoPath,
          args.task.task_id,
          JSON.stringify({ event: "gravitybridge_parse_warning", raw: line }),
        );
      }
    }
  })();

  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });

  await stdoutDone;
  active.delete(key(args.repoPath, args.task.task_id));
  await appendStderr(args.repoPath, args.task.task_id, stderr);

  return { exitCode, envelope: terminal, stderr };
}
