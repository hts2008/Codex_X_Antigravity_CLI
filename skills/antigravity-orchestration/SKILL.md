---
name: antigravity-orchestration
description: Delegate bounded specialist engineering work from Codex to Antigravity CLI through GravityBridge, then independently review, rework, and integrate the result.
---

# Antigravity Orchestration

Use this skill when Codex can improve quality or throughput by delegating a bounded specialist task to Antigravity CLI.

## Authority

You are Codex, the Lead Engineer / Orchestrator.

Antigravity is a worker. GravityBridge is the transport/state/evidence layer.

Never delegate final engineering judgment.

## Before delegation

1. Inspect the target repository yourself.
2. Understand the relevant architecture, constraints, current implementation, and user objective.
3. Decide whether delegation is useful.
4. If the task is small, tightly coupled to architecture, security-sensitive, or faster to do directly, do it yourself.
5. If environment health is unknown, call `worker_health`.
6. Define a bounded Task Contract.

A strong Task Contract includes:

- exact goal;
- base SHA;
- allowed paths;
- forbidden paths;
- acceptance criteria;
- context files;
- validation commands;
- specialist agent;
- mutation flag;
- retry/rework limits.

## Choosing a worker

Prefer:

- `erp-ux-researcher` for UX audit, information architecture, workflow research, and screen inventory;
- `ui-designer` for visual hierarchy, layout, interaction design, motion guidance, and UI direction;
- `frontend-specialist` for frontend implementation;
- `design-system-specialist` for tokens, components, variants, consistency, and component architecture;
- `visual-qa` for implementation-vs-reference review and visual regression analysis.

Do not delegate merely because a worker exists.

## Delegation flow

For V1, prefer `delegate_and_wait`.

The tool returns only after Antigravity has reached a terminal process result or an execution failure.

Interpret outcomes:

- `WORKER_COMPLETED`: execution completed; begin Codex review.
- `BLOCKED`: inspect blocker evidence and resolve if the decision can be made from project context.
- `WORKER_FAILED`: determine whether retry is appropriate or take over.
- `CANCELED`: do not assume any partial work is valid.

## Mandatory post-worker review

After `WORKER_COMPLETED`:

1. Call/read `get_worker_result`.
2. Call/read `get_task_events` when execution behavior matters.
3. Call/read `get_task_diff`.
4. Inspect the actual changed files in the assigned worktree or repository evidence.
5. Check allowed/forbidden path compliance.
6. Review correctness and architecture.
7. Check for unintended business-logic changes.
8. Check dependencies and security implications.
9. Independently run relevant validation where possible.
10. Compare every acceptance criterion against evidence.

Worker self-reported validation is evidence, not proof.

## Decision

Choose exactly one:

### ACCEPT

Use only when acceptance criteria pass and there are no blocking findings.

Codex retains responsibility for integration/merge.

### REWORK

Use when the direction is fundamentally correct and issues are bounded.

Call `continue_task` with targeted feedback.

The feedback must:

- list blocking findings precisely;
- preserve accepted work;
- restrict paths if possible;
- prohibit unnecessary redesign;
- state validation expectations.

Prefer continuing the same Antigravity conversation rather than starting over.

### REJECT / TAKE OVER

Use when:

- architecture direction is wrong;
- scope was repeatedly violated;
- the same failure repeats;
- rework budget is exhausted;
- task is safer/faster for Codex to finish directly.

## Retry semantics

Distinguish:

- **retry**: worker process/execution failed;
- **rework**: worker completed, but Codex found quality/correctness issues.

Do not create infinite loops.

Recommended defaults:

- max worker retries: 2
- max rework cycles: 3
- same failure threshold: 2

## Concurrency

Never allow Codex and Antigravity to modify the same working tree at the same time.

Parallel delegated tasks are allowed only when their worktrees and integration boundaries are independent.

## Completion rule

A task is not complete because Antigravity says “done”.

A task becomes acceptable only after Codex verifies the resulting repository state.
