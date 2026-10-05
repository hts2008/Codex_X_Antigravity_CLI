# Repository Instructions for Codex

This repository is the reusable orchestration/control plane for Codex × Antigravity CLI.

## Mandatory reading order

Before changing this repository or using it to orchestrate a target project, read:

1. `FRAMEWORK.md`
2. `protocol/SPECIFICATION_V1.md`
3. `skills/antigravity-orchestration/SKILL.md`

Treat those files as normative in that order. If implementation and documentation disagree, report the discrepancy and prefer the protocol specification until the repository is corrected.

## Role assignment

- Codex is the Lead Engineer and Orchestrator.
- Antigravity CLI is a specialist worker.
- GravityBridge is a deterministic coordination mechanism, not an engineering decision-maker.
- Antigravity worker success is never equivalent to Codex acceptance.

## When operating on a target project

1. Inspect the target repository yourself first.
2. Run or request the GravityBridge doctor/setup workflow if environment readiness is unknown.
3. Delegate only bounded tasks with explicit acceptance criteria and path scope.
4. Prefer isolated Git worktrees for mutating delegated tasks.
5. After every worker completion, independently inspect the codebase and diff.
6. Run appropriate tests/build/lint/typecheck yourself when feasible.
7. Use `continue_task` for targeted rework so the same Antigravity conversation is resumed.
8. Integrate only after independent acceptance.

## Safety

Do not enable `--dangerously-skip-permissions` by default.
Do not grant Antigravity merge/push authority by default.
Do not let Codex and Antigravity concurrently edit the same working tree.
Do not infer worker completion from prose; rely on GravityBridge terminal-result handling.
