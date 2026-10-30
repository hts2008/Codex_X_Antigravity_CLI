import type { TaskState } from "./types.js";

/** Single source of truth for allowed state transitions. */
export const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  CREATED: ["RUNNING"],
  RUNNING: ["WORKER_COMPLETED", "BLOCKED", "WORKER_FAILED", "CANCELED"],
  WORKER_COMPLETED: ["ACCEPTED", "CHANGES_REQUESTED", "REJECTED", "CODEX_TAKEOVER"],
  BLOCKED: ["RUNNING", "CHANGES_REQUESTED", "REJECTED", "CODEX_TAKEOVER"],
  WORKER_FAILED: ["RUNNING", "REJECTED", "CODEX_TAKEOVER"],
  CANCELED: ["RUNNING", "REJECTED", "CODEX_TAKEOVER"],
  CHANGES_REQUESTED: ["RUNNING", "REJECTED", "CODEX_TAKEOVER"],
  ACCEPTED: [],
  REJECTED: [],
  CODEX_TAKEOVER: [],
};

export const TERMINAL_STATES: readonly TaskState[] = ["ACCEPTED", "REJECTED", "CODEX_TAKEOVER"];

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(taskId: string, from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) {
    const allowed = TRANSITIONS[from].join(", ") || "none (terminal)";
    throw new Error(`Task ${taskId}: transition ${from} -> ${to} is not allowed. Allowed from ${from}: ${allowed}.`);
  }
}

/** Human/agent-oriented hint about what Codex should do next. */
export function nextActionHint(state: TaskState): string {
  switch (state) {
    case "RUNNING": return "Call await_task again until the state changes.";
    case "WORKER_COMPLETED": return "Review: get_task_diff, inspect files, check bridge_validation, then record_review.";
    case "BLOCKED": return "Read the blockers. Answer with continue_task(feedback), or record_review REJECT/TAKEOVER.";
    case "WORKER_FAILED": return "Execution failed. retry_task if budget remains and the failure is transient; otherwise record_review TAKEOVER.";
    case "CANCELED": return "retry_task to resume, or record_review REJECT/TAKEOVER.";
    case "CHANGES_REQUESTED": return "Call continue_task with targeted feedback.";
    case "ACCEPTED": return "Integrate in the main repo (git merge --squash <branch>), verify, commit, then cleanup_task.";
    case "REJECTED":
    case "CODEX_TAKEOVER": return "Worker authority ended. cleanup_task when the worktree is no longer needed.";
    default: return "";
  }
}

/** Normalised failure fingerprint used to detect "same failure again" loops. */
export function failureSignature(error: string): string {
  return error.toLowerCase().replace(/[0-9a-f]{8,}/g, "#").replace(/\d+/g, "#").replace(/\s+/g, " ").slice(0, 160);
}
