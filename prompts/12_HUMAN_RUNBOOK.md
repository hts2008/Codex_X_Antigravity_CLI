# Human Runbook

This file is written for the Human operator.

## First time on a machine

Paste `01_MACHINE_BOOTSTRAP.md` into Codex.

After it passes, normally you do not use it again.

## First time with a project

Paste `02_NEW_PROJECT_BOOTSTRAP.md`.

This should create or update the lightweight durable coordination files under:

`docs/GRAVITYBRIDGE/`.

It should stop before product implementation.

## Every new Codex session

Paste `03_SESSION_START.md`.

If you already know what you want done, put the objective into its optional objective section.

## Normal work

Use `04_DAILY_WORK.md`.

In practice your input can be short because the prompt instructs Codex to recover project state and manage Antigravity itself.

Example objective:

`Redesign the ERP sales dashboard according to the approved UX direction, implement it, validate it, and do not change backend contracts.`

You should not need to tell Codex:

- when to call Antigravity;
- which agent to choose;
- when to review;
- when to request rework.

Those are Codex orchestration responsibilities.

## When a session was interrupted

Use `06_RESUME_RECOVERY.md`.

Do not manually summarize what happened unless it is useful context. Durable Git/GravityBridge/project-memory evidence should be primary.

## When state looks wrong

Use `07_SYNC_RECONCILE.md`.

Typical signs:

- Codex mentions the wrong branch;
- a task looks complete in one place but pending in another;
- project memory references an old SHA;
- worktree exists but ledger says nothing;
- remote moved since last session.

## End of day

Use `08_SESSION_CLOSE.md`.

This is valuable before closing a long session because it creates a clean recovery point.

## Requirement changed

Use `09_REQUIREMENT_CHANGE.md`.

This prevents Codex from blindly continuing an Antigravity conversation whose original task contract is now stale.

## Bug

Use `10_DEBUG_FIX.md`.

## Merge or release

Use `11_RELEASE_GATE.md`.

## Most important rule

Human communicates primarily with Codex.

Normal path:

```text
Human
  -> Codex
     -> GravityBridge
        -> Antigravity CLI
     <- evidence/result
  <- final reviewed outcome
```

Avoid:

```text
Human -> Codex -> copy -> Antigravity -> copy -> Codex
```

That manual relay model is unnecessary once GravityBridge is operational.
