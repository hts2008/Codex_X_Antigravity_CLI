# Repository Instructions for Codex

This repository is the reusable orchestration/control plane for Codex × Antigravity CLI.

## Mandatory reading order

Before changing this repository or using it to orchestrate a target project, read:

1. `FRAMEWORK.md`
2. `protocol/SPECIFICATION_V1.md`
3. `protocol/PROMPT_SYSTEM.md`
4. `prompts/13_PROMPT_USAGE_ORDER.md`
5. `skills/antigravity-orchestration/SKILL.md`

Treat those files as normative in that order. If implementation and documentation disagree, report the discrepancy and prefer the protocol specification until the repository is corrected.

## Role assignment

- Codex is the Lead Engineer and Orchestrator.
- Antigravity CLI is a coding worker only (agents `gb-coder`, `gb-frontend-coder`): it implements, it never decides.
- GravityBridge is a deterministic coordination mechanism, not an engineering decision-maker.
- Antigravity worker success is never equivalent to Codex acceptance.

## When operating on a target project

1. Inspect the target repository yourself first.
2. If this is the first attachment of the target project, apply the project bootstrap protocol and create/update `docs/GRAVITYBRIDGE/`.
3. At fresh-session start, recover `PROJECT_PROFILE.md`, `CURRENT_STATE.md`, `SESSION_HANDOFF.md`, recent decisions/tasks, and actual Git state before material work.
4. If environment readiness is unknown, call `worker_health` (or ask the human to run `scripts/doctor`).
5. Delegate only bounded tasks with explicit acceptance criteria and path scope.
6. Commit or stash first: `start_task` requires a clean repo and creates an isolated worktree on branch `gb/<task_id>`. Then loop `await_task` until the state is not RUNNING.
7. After every worker completion, check `scope_violations`, `bridge_validation`, `claim_mismatches`, then read the real diff (`get_task_diff`).
8. Run appropriate tests/build/lint/typecheck yourself when feasible.
9. For targeted rework: `record_review(REWORK, blocking_findings)` then `continue_task`, so the same Antigravity conversation is resumed.
10. Use `retry_task` only for execution failure, not implementation-quality rework.
11. Integrate only after `record_review(ACCEPT)`: `git merge --squash gb/<task_id>`, verify, commit, then `cleanup_task`.
12. For material multi-session work, keep target `docs/GRAVITYBRIDGE/CURRENT_STATE.md`, `TASK_LEDGER.md`, and `SESSION_HANDOFF.md` factual and recoverable.

## Safety

Do not enable `--dangerously-skip-permissions` by default.
Do not grant Antigravity merge/push authority by default.
Do not let Codex and Antigravity concurrently edit the same working tree.
Do not infer worker completion from prose; rely on GravityBridge terminal-result handling.
Do not edit a task worktree yourself while its task is RUNNING.

## Changing this repository

Run `npm run typecheck && npm run build && npm test` in `packages/gravitybridge`. After editing `src/types.ts`, run `npm run gen:schemas`.
