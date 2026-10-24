import { z } from "zod";

/** Strict, conservative task identifier. Used everywhere a task_id enters the system. */
export const TaskIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/).min(3).max(96);

const DurationSchema = z.string().regex(/^[0-9]+[smh]$/);

export const TaskContractSchema = z.object({
  schema_version: z.literal("1.0"),
  task_id: TaskIdSchema,
  type: z.string().min(1).max(80),
  goal: z.string().min(10).max(8_000),
  base_sha: z.string().regex(/^[0-9a-fA-F]{7,64}$/).optional()
    .describe("Commit the worker starts from. Must equal the target repo HEAD. Omit to use the current HEAD."),
  mutating: z.boolean().default(true)
    .describe("false = read-only task: every file write is blocked and any change is a scope violation."),
  scope: z.object({
    allowed_paths: z.array(z.string().min(1)).min(1)
      .describe("Glob patterns relative to repo root, e.g. src/app/dashboard/**"),
    forbidden_paths: z.array(z.string().min(1)).default([]),
  }),
  acceptance_criteria: z.array(z.string().min(1).max(1_000)).min(1).max(30),
  context: z.array(z.string().min(1)).max(50).default([])
    .describe("Files the worker should read first."),
  setup_commands: z.array(z.string().min(1)).max(10).default([])
    .describe("Run by GravityBridge (not the worker) once in the fresh worktree before the first turn, e.g. 'npm ci'."),
  validation_commands: z.array(z.string().min(1)).max(10).default([])
    .describe("Pre-approved for the worker AND re-run independently by GravityBridge after every completed turn."),
  allowed_commands: z.array(z.string().min(1)).max(20).default([])
    .describe("Extra exact command lines the worker may run without approval."),
  worker: z.object({
    agent: z.string().min(1).max(96).default("gb-coder"),
    model: z.string().min(1).max(160).optional(),
    effort: z.enum(["low", "medium", "high"]).default("high"),
    print_timeout: DurationSchema.default("30m"),
  }).default({ agent: "gb-coder", effort: "high", print_timeout: "30m" }),
  limits: z.object({
    max_retries: z.number().int().min(0).max(10).default(2),
    max_rework_cycles: z.number().int().min(0).max(10).default(3),
    max_blocker_answers: z.number().int().min(0).max(10).default(3),
    setup_timeout: DurationSchema.default("20m"),
    validation_timeout: DurationSchema.default("15m"),
  }).default({ max_retries: 2, max_rework_cycles: 3, max_blocker_answers: 3, setup_timeout: "20m", validation_timeout: "15m" }),
  notes: z.string().max(4_000).optional(),
});

export type TaskContract = z.infer<typeof TaskContractSchema>;

/** Structured result the Antigravity worker must return (enforced via --json-schema). */
export const WorkerResultSchema = z.strictObject({
  schema_version: z.literal("1.0"),
  task_id: z.string().min(3).max(96),
  worker_status: z.enum(["completed", "blocked"]),
  summary: z.string().min(1).max(20_000),
  files_changed: z.array(z.string()),
  commands_run: z.array(z.string()),
  validation: z.record(z.string(), z.enum(["passed", "failed", "not_run", "not_applicable"])),
  assumptions: z.array(z.string()),
  known_issues: z.array(z.string()),
  blockers: z.array(z.strictObject({
    type: z.string(),
    question: z.string(),
    options: z.array(z.string()).optional(),
    evidence: z.array(z.string()),
  })),
  recommendations: z.array(z.string()),
});

export type WorkerResult = z.infer<typeof WorkerResultSchema>;

export const ReviewSchema = z.object({
  schema_version: z.literal("1.0"),
  task_id: TaskIdSchema,
  decision: z.enum(["ACCEPT", "REWORK", "REJECT", "TAKEOVER"]),
  blocking_findings: z.array(z.string()).default([]),
  non_blocking_findings: z.array(z.string()).default([]),
  override_reason: z.string().min(10).max(2_000).optional()
    .describe("Required to ACCEPT while GravityBridge validation failed (e.g. failure pre-exists on base)."),
  quality: z.record(z.string(), z.number().int().min(0).max(100)).optional(),
});

export type Review = z.infer<typeof ReviewSchema>;

export const TASK_STATES = [
  "CREATED",
  "RUNNING",
  "WORKER_COMPLETED",
  "BLOCKED",
  "WORKER_FAILED",
  "CANCELED",
  "CHANGES_REQUESTED",
  "ACCEPTED",
  "REJECTED",
  "CODEX_TAKEOVER",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export type TurnKind = "initial" | "rework" | "blocker_answer" | "retry";

export interface WorkerEnvelope {
  conversation_id?: string;
  status?: string;
  response?: string;
  error?: string;
  duration_seconds?: number;
  num_turns?: number;
  structured_output?: Record<string, unknown>;
  usage?: Record<string, number>;
}

export interface ChangedFile {
  status: string; // A, M, D, R, C, T
  path: string;
  old_path?: string;
}

export interface CommandResult {
  command: string;
  exit_code: number | null;
  timed_out: boolean;
  duration_seconds: number;
  output_tail: string;
}

export interface TurnSummary {
  turn: number;
  kind: TurnKind;
  started_at: string;
  finished_at?: string;
  outcome?: TaskState;
  exit_code?: number | null;
  agy_status?: string;
  error?: string;
  head_before?: string;
  head_after?: string;
  turn_changed_files?: string[];
  scope_violations?: string[];
  git_violations?: string[];
  claim_mismatches?: string[];
  permission_notices?: string[];
  tool_errors?: string[];
  setup?: CommandResult[];
  bridge_validation?: CommandResult[];
  worker_result?: WorkerResult;
  usage?: Record<string, number>;
  tool_steps?: number;
}

export interface TaskRecord {
  schema_version: "1.1";
  repo_path: string;
  repo_key: string;
  task: TaskContract & { base_sha: string };
  state: TaskState;
  branch_name: string;
  worktree_path: string;
  conversation_id?: string;
  retries: number;
  rework_cycles: number;
  blocker_answers: number;
  same_failure_count: number;
  last_failure_signature?: string;
  setup_ok: boolean;
  created_at: string;
  updated_at: string;
  last_error?: string;
  changed_files: ChangedFile[];
  scope_violations: string[];
  turns: TurnSummary[];
  active_run?: { turn: number; kind: TurnKind; started_at: string; deadline_at: string };
  last_review?: Review;
  cleaned_up?: boolean;
}
