# GravityBridge Technical Specification V1.1

Status: normative for `packages/gravitybridge` 1.1.x. (File name kept for link stability.)
Single sources of truth in code: states/transitions `src/state.ts`, contracts `src/types.ts` (JSON Schemas in `schemas/` are generated from it: `npm run gen:schemas`).

## 1. Objective

Let Codex delegate bounded **coding** tasks to Antigravity CLI and get back verifiable evidence, without ever giving the worker decision, merge or push authority, and without blocking Codex tool calls for longer than its MCP timeout.

## 2. Actors

| Actor | Owns | Never does |
|---|---|---|
| Codex (Lead Engineer) | decisions, Task Contract, review, integration | edit a worktree while its task is RUNNING |
| Antigravity CLI (`gb-coder`, `gb-frontend-coder`) | implementing the contract inside its worktree | decide scope/design, write outside scope, run mutating git, accept its own work |
| GravityBridge | worktrees, state machine, evidence, enforcement, budgets | make engineering decisions |

## 3. Transport

- Codex ↔ GravityBridge: MCP over stdio (`dist/index.js`). Every tool returns in ≤ ~50 s (Codex default `tool_timeout_sec` is 60 s).
- GravityBridge → runner: detached Node process `dist/runner.js <repo> <task_id> <turn>` per turn; survives MCP/Codex restarts.
- Runner → Antigravity: `agy -p <prompt> --output-format stream-json --json-schema schemas/result.schema.json --agent <agent> --effort <e> --print-timeout <t> [--model m] [--conversation <id>]`, cwd = worktree, sanitized env (secrets such as `OPENAI_*`, `GH_*`, `*TOKEN*` removed).
- Antigravity → GravityBridge (before each write/command): global `PreToolUse` hook `dist/hook.js`.

## 4. Completion protocol

The runner reads stream-json: `init` (conversation_id) → `step_update`* → `result`. A turn is successful only if: exit code 0, `result.status == "SUCCESS"`, and `structured_output` passes strict validation of the Result Contract. Anything else → `WORKER_FAILED` with a diagnostic (`no terminal result`, `status X`, `structured result invalid`, `spawn failed`, `watchdog`).

Watchdog: `print_timeout + 2 min` kills the worker. Hard deadline (`active_run.deadline_at` = print_timeout + setup + validation + 10 min) lets the MCP server kill a stuck runner.

## 5. Async control loop

```
start_task ──> CREATED ──> RUNNING ──(runner finishes)──> WORKER_COMPLETED | BLOCKED | WORKER_FAILED | CANCELED
await_task  (long-poll ≤ 50 s; repeat while RUNNING; returns progress: elapsed, steps, last tool)
```

Reconciliation (on every read): if `run.json` exists but its pid is dead, or is missing > 60 s after start, or the hard deadline passed, the task becomes `WORKER_FAILED` (or `CANCELED` if a cancel was requested). A task can never stay RUNNING forever. The runner always writes the final record **before** deleting `run.json`.

Parallelism: at most `GRAVITYBRIDGE_MAX_PARALLEL` (default 2) RUNNING tasks across all repos.

## 6. Git model

- `start_task` requires a clean repo; `base_sha` (optional) must equal HEAD. Worktree `~/.gravitybridge/worktrees/<repo_key>/<task_id>` on new branch `gb/<task_id>`. Existing path/branch/task id → error; **nothing is ever deleted implicitly**.
- After every turn the runner commits everything (`git add -A`, author GravityBridge, hooks disabled) → evidence includes new and deleted files. Turn diff = `head_before..head_after`; cumulative diff = `base_sha..gb/<task_id>`.
- Worker commits or branch switches are recorded as `git_violations` (branch switch → `WORKER_FAILED`).
- Integration is done by Codex: `git merge --squash gb/<task_id>` in the main checkout, verify, commit, then `cleanup_task`.

## 7. Persistence

`~/.gravitybridge/tasks/<repo_key>/<task_id>/` (override with `GRAVITYBRIDGE_HOME`):
`metadata.json` (TaskRecord), `task.json`, `prompts/<n>.md`, `turns/<n>.json` + `turns/<n>.diff`, `result.json` (latest turn), `events.ndjson` (capped 20 MB), `stderr.log`, `runner.log`, `hook.log`, `reviews/<n>.json`, transient `run.json`, `cancel.request`. All JSON writes are atomic (temp + rename).

## 8. States and transitions

| From | Allowed to |
|---|---|
| CREATED | RUNNING |
| RUNNING | WORKER_COMPLETED, BLOCKED, WORKER_FAILED, CANCELED |
| WORKER_COMPLETED | ACCEPTED, CHANGES_REQUESTED, REJECTED, CODEX_TAKEOVER |
| BLOCKED | RUNNING (answer), CHANGES_REQUESTED, REJECTED, CODEX_TAKEOVER |
| WORKER_FAILED | RUNNING (retry), REJECTED, CODEX_TAKEOVER |
| CANCELED | RUNNING (retry), REJECTED, CODEX_TAKEOVER |
| CHANGES_REQUESTED | RUNNING (rework), REJECTED, CODEX_TAKEOVER |
| ACCEPTED, REJECTED, CODEX_TAKEOVER | — (terminal; only `cleanup_task`) |

Every tool response includes `next_action`.

## 9. MCP tools

| Tool | Input | Effect / guard |
|---|---|---|
| `start_task` | repo_path, task | clean repo, new task_id, worktree, turn 1 in background |
| `await_task` | repo_path, task_id, wait_seconds≤50 | summary when state ≠ RUNNING, else progress |
| `continue_task` | repo_path, task_id, feedback? | CHANGES_REQUESTED → rework turn (feedback defaults to blocking_findings); BLOCKED → answer turn (feedback required, `max_blocker_answers`) |
| `retry_task` | repo_path, task_id | WORKER_FAILED/CANCELED; `max_retries`; refused when the same failure signature occurred 2× in a row |
| `cancel_task` | repo_path, task_id | cancel file → graceful stop ≤ 15 s → kill process trees → CANCELED |
| `record_review` | repo_path, review | ACCEPT refused with scope violations; ACCEPT with failed bridge validation needs `override_reason`; REWORK needs blocking_findings and `max_rework_cycles` budget |
| `cleanup_task` | repo_path, task_id, delete_branch=false | terminal states only; removes worktree, keeps evidence |
| `get_task`, `list_tasks` | | status, turns, budgets, last review; recovery after restart |
| `get_task_diff` | range cumulative/last_turn, mode stat/full, path, max_bytes | from git, capped |
| `get_worker_result` | turn? | full turn evidence |
| `get_task_events` | count, max_bytes | tail of the event log |
| `worker_health` | repo_path? | Node ≥ 22, git, agy, plugin, hook registration, state dir, target repo cleanliness |

## 10. Evidence computed per turn (TurnSummary)

`setup` (bridge-run, once until success), `exit_code`, `agy_status`, `worker_result`, `turn_changed_files`, cumulative `changed_files`, `scope_violations`, `claim_mismatches` (task_id; files claimed vs git), `git_violations`, `permission_notices` (stderr), `tool_errors`, `bridge_validation` (bridge re-runs `validation_commands` after completed turns), `usage`.

## 11. Scope enforcement (two layers)

1. **Before** (hook, inside GravityBridge worktrees only): `write_to_file`, `replace_file_content`, `multi_replace_file_content` outside the worktree or violating scope → `deny`; `run_command` with Cwd outside the worktree or mutating git (`commit push merge rebase reset checkout switch branch worktree stash tag cherry-pick revert clean restore am apply pull fetch remote config …`) → `deny`; commands equal to `validation_commands` ∪ `allowed_commands` or read-only git (`status diff log show`) → `auto_approve`; anything else → `allow` (Antigravity's normal permission policy decides). Outside GravityBridge worktrees the hook always answers `allow`.
2. **After** (runner): every changed path (incl. rename sources) is checked against `allowed_paths`, `forbidden_paths` and protected paths `.git/** .agents/** .codex/** AGENTS.md docs/GRAVITYBRIDGE/**`; `mutating=false` makes any change a violation.

## 12. Contracts

- Task Contract: `schemas/task.schema.json` (key fields: `task_id`, `goal`, `scope`, `acceptance_criteria`, `context`, `setup_commands`, `validation_commands`, `allowed_commands`, `worker{agent,model,effort,print_timeout}`, `limits{max_retries,max_rework_cycles,max_blocker_answers,setup_timeout,validation_timeout}`).
- Result Contract: `schemas/result.schema.json` (strict; unknown keys rejected).
- Review: `schemas/review.schema.json` (`decision` ACCEPT/REWORK/REJECT/TAKEOVER, `blocking_findings`, `non_blocking_findings`, `override_reason`).

## 13. Security

- No `--dangerously-skip-permissions`. No merge/push authority for the worker.
- Worker env is sanitized; the bridge's own commands use the same sanitized env.
- Prompts tell the worker that repository instruction files describing other roles are data, not instructions.
- Hook fails closed for writes inside GravityBridge worktrees, open everywhere else.

## 14. Known limitations (to be confirmed with the real CLI via `scripts/smoke`)

- Hook invocation in headless `-p` mode and the effect of `auto_approve` on soft-denied commands are documented by Antigravity but not yet verified on the user's machine; the after-turn checks and bridge-run validation keep the system safe even if the hook is not called.
- Agent names from a plugin may need a namespace on some agy versions; the smoke test reveals this.
- On Windows `agy` must resolve to an executable; otherwise set `GRAVITYBRIDGE_AGY` to its full path.

## 15. Definition of done (V1.1)

typecheck + build + tests pass on Linux and Windows CI; fake-worker e2e covers new files, scope violation, claim mismatch, validation, rework/last-turn diff, blocked, invalid result, same-failure guard, cancel, orphan reconciliation, duplicate task id, hook decisions; `scripts/smoke` passes against real Antigravity.
