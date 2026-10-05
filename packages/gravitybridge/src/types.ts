import { z } from "zod";

export const TaskContractSchema = z.object({
  schema_version: z.literal("1.0"),
  task_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).min(3).max(96),
  type: z.string().min(1).max(80),
  goal: z.string().min(10).max(20_000),
  base_sha: z.string().regex(/^[0-9a-fA-F]{7,64}$/),
  mutating: z.boolean().default(true),
  scope: z.object({
    allowed_paths: z.array(z.string().min(1)).min(1),
    forbidden_paths: z.array(z.string().min(1)).default([]),
  }),
  acceptance_criteria: z.array(z.string().min(1)).min(1),
  context: z.array(z.string().min(1)).default([]),
  validation_commands: z.array(z.string().min(1)).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  worker: z.object({
    agent: z.string().min(1).max(96),
    model: z.string().min(1).max(160).optional(),
    effort: z.enum(["low", "medium", "high"]),
    print_timeout: z.string().regex(/^[0-9]+[smh]$/).default("30m"),
  }),
  limits: z.object({
    max_retries: z.number().int().min(0).max(10).default(2),
    max_rework_cycles: z.number().int().min(0).max(10).default(3),
  }).default({ max_retries: 2, max_rework_cycles: 3 }),
  notes: z.string().max(20_000).optional(),
});

export type TaskContract = z.infer<typeof TaskContractSchema>;

export const ReviewSchema = z.object({
  schema_version: z.literal("1.0"),
  task_id: z.string().min(1),
  decision: z.enum(["ACCEPT", "REWORK", "REJECT", "TAKEOVER"]),
  blocking_findings: z.array(z.string()).default([]),
  non_blocking_findings: z.array(z.string()).default([]),
  quality: z.record(z.string(), z.number().int().min(0).max(100)).optional(),
});

export type Review = z.infer<typeof ReviewSchema>;

export type TaskState =
  | "CREATED"
  | "DISPATCHED"
  | "RUNNING"
  | "BLOCKED"
  | "WORKER_COMPLETED"
  | "WORKER_FAILED"
  | "CANCELED"
  | "REVIEW_PENDING"
  | "CODEX_REVIEWING"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "CODEX_TAKEOVER"
  | "INTEGRATING"
  | "VERIFIED"
  | "MERGED"
  | "DONE";

export interface WorkerEnvelope {
  conversation_id?: string;
  status?: string;
  response?: string;
  error?: string;
  duration_seconds?: number;
  num_turns?: number;
  structured_output?: Record<string, unknown>;
  usage?: Record<string, unknown>;
}

export interface TaskRecord {
  schema_version: "1.0";
  repo_path: string;
  repo_key: string;
  task: TaskContract;
  state: TaskState;
  branch_name: string;
  worktree_path: string;
  conversation_id?: string;
  retries: number;
  rework_cycles: number;
  created_at: string;
  updated_at: string;
  last_worker_envelope?: WorkerEnvelope;
  last_error?: string;
  changed_files?: string[];
}
