---
name: antigravity-orchestration
description: Delegate bounded coding work from Codex to Antigravity CLI through the GravityBridge MCP server (async start/await loop), then independently review, request rework, and integrate. Use when a well-specified implementation task can be handed to a coding worker while Codex keeps every decision.
---

# Antigravity Orchestration (GravityBridge V1.1)

## Roles (fixed)

- **You (Codex) = Lead Engineer.** You decide architecture, scope, UX/product choices, acceptance, integration. You write the Task Contract and review the result.
- **Antigravity = coding worker only.** It implements exactly the contract, in an isolated worktree, with agent `gb-coder` (or `gb-frontend-coder` for UI work). It never decides, merges or pushes.
- **GravityBridge = deterministic plumbing.** Worktrees, state machine, scope hook, evidence (real git diff incl. new files), independent validation, budgets.

Worker "completed" is never acceptance. Only your review after inspecting evidence is.

## When to delegate

Delegate when the task is well specified, bounded to a few paths, and verifiable by commands. Do it yourself when it is tiny, architecture-defining, security-sensitive, or faster to do directly. Decide first, then delegate: the contract must contain the decisions, not ask the worker to make them.

## Before delegating

1. Inspect the target repo yourself (relevant code, conventions, how to build/test).
2. Make sure the repo is **clean and committed** (`git status` empty). GravityBridge refuses dirty repos because the worker starts from HEAD.
3. If environment readiness is unknown, call `worker_health` (with `repo_path`).
4. Write the Task Contract (schema: `schemas/task.schema.json`):
   - `task_id`: new and unique (e.g. `GB-UI-007`); never reuse one.
   - `goal`: precise, including the decisions you already made.
   - `scope.allowed_paths` (globs) / `forbidden_paths`: as narrow as possible. Protected always: `.git/ .agents/ .codex/ AGENTS.md docs/GRAVITYBRIDGE/`.
   - `acceptance_criteria`: checkable statements.
   - `context`: files to read first.
   - `setup_commands`: e.g. `["npm ci"]` (worktrees have no `node_modules`). Run by the bridge once.
   - `validation_commands`: e.g. `["npm run lint", "npm run build"]`. Pre-approved for the worker and **re-run by the bridge** after each completed turn.
   - `worker.agent`: `gb-coder` (default) or `gb-frontend-coder`; `effort`, `print_timeout`.
   - `limits` if defaults (2 retries, 3 rework cycles, 3 blocker answers) are not right.

See `examples/task.frontend-ui.json`.

## The async loop (tools)

```
start_task(repo_path, task)            -> RUNNING (returns immediately)
await_task(repo_path, task_id)         -> repeat while RUNNING (each call waits <= 45 s)
  WORKER_COMPLETED -> review (below) -> record_review(ACCEPT | REWORK | REJECT | TAKEOVER)
  BLOCKED          -> answer: continue_task(feedback=answer)   or record_review REJECT/TAKEOVER
  WORKER_FAILED    -> retry_task (transient failures only)    or record_review TAKEOVER
  CANCELED         -> retry_task or record_review
REWORK -> state CHANGES_REQUESTED -> continue_task(feedback optional; defaults to blocking_findings) -> await_task ...
ACCEPTED -> integrate (below) -> cleanup_task
```

Other tools: `get_task` (full status), `list_tasks` (recover after a restart), `get_task_diff` (`range` cumulative|last_turn, `mode` stat|full, `path`), `get_worker_result` (full evidence of a turn), `get_task_events` (raw worker log tail), `cancel_task`.

While a task runs you may do other read-only work, but **never edit the task's worktree yourself** while it is RUNNING. Up to `GRAVITYBRIDGE_MAX_PARALLEL` (default 2) tasks may run at once if their scopes do not overlap.

## Review (mandatory after WORKER_COMPLETED)

The `await_task` summary already contains the bridge's evidence. Check, in order:

1. `scope_violations` – must be empty (ACCEPT is refused otherwise).
2. `latest_turn.bridge_validation` – independent results of `validation_commands`. Failing → REWORK, or ACCEPT with `override_reason` only if the failure pre-exists on base (verify!).
3. `latest_turn.claim_mismatches`, `git_violations`, `permission_notices`, `tool_errors` – signs of an unreliable turn.
4. `get_task_diff` (stat, then `mode=full` per file) – read the real code. Check correctness, conventions, unintended logic changes, new dependencies, security.
5. Compare every acceptance criterion against evidence. Run extra checks yourself in the worktree (read-only) if needed.

Decide exactly one:

- **ACCEPT** – all criteria met, no blocking findings.
- **REWORK** – direction right, issues bounded. `blocking_findings` must list each concrete fix (file, problem, expected result). Do not ask for redesign.
- **REJECT** – wrong direction; discard.
- **TAKEOVER** – you finish it yourself (same failure twice, budget exhausted, or faster).

## Integration (after ACCEPT)

In the main checkout (clean):

```
git merge --squash gb/<task_id>
# run the project's validation yourself
git commit -m "<task_id>: <summary>"
```

Then `cleanup_task(repo_path, task_id, delete_branch=true)`. Never let the worker push or merge.

## Failure handling

- `retry_task` is for execution failures (crash, timeout, invalid result), not for quality issues (use REWORK).
- The bridge refuses a retry after the **same failure twice**: fix the cause (missing setup command, denied command, wrong contract) or TAKEOVER.
- `setup failed` → fix `setup_commands` in a new task, or TAKEOVER.
- Permission notices on commands → the command is not in `validation_commands`/`allowed_commands`; add it in a new task if it is truly needed.

## Session handoff

For multi-session work keep the target project's `docs/GRAVITYBRIDGE/` (CURRENT_STATE, TASK_LEDGER, SESSION_HANDOFF, DECISION_LOG) factual. At session start call `list_tasks(repo_path)` to find unfinished tasks. Persist facts, decisions and next safe actions only.
