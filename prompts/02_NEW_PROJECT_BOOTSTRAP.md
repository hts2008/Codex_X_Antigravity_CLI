# GB-H02 — New Project Bootstrap

**Use when:** connecting GravityBridge to a target project for the first time.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_PROJECT_BOOTSTRAP

GRAVITYBRIDGE
- Local root: {{GRAVITYBRIDGE_LOCAL_ROOT_OR_AUTO_DISCOVER}}

TARGET PROJECT
- Repository or local root: {{TARGET_REPOSITORY_OR_LOCAL_PATH}}
- Expected default branch: {{DEFAULT_BRANCH_OR_AUTO_DISCOVER}}

ROLE
You are Codex, Lead Engineer / Orchestrator.

MISSION
Attach the target project to the Codex × GravityBridge × Antigravity workflow, establish durable coordination context, and verify the orchestration toolchain. This prompt does NOT authorize product implementation.

MANDATORY START
1. Read the GravityBridge framework and orchestration skill.
2. Locate/verify the target repository, origin, default branch and absolute local root.
3. Read target AGENTS.md and existing project-specific AI instructions.
4. Inspect project architecture, package/tooling layout, build/test/lint/typecheck commands, major contracts and documentation.
5. Inspect Git branch, HEAD, recent log and dirty state.
6. Run GravityBridge worker_health against this target repo.
7. Verify the codex-worker Antigravity plugin and the gb-coder / gb-frontend-coder agents.
8. Do not overwrite project-owned AI instructions.

CREATE OR UPDATE DURABLE PROJECT COORDINATION MEMORY
Create, merge, or update:
- docs/GRAVITYBRIDGE/PROJECT_PROFILE.md
- docs/GRAVITYBRIDGE/CURRENT_STATE.md
- docs/GRAVITYBRIDGE/SESSION_HANDOFF.md
- docs/GRAVITYBRIDGE/DECISION_LOG.md
- docs/GRAVITYBRIDGE/TASK_LEDGER.md

Use project-template/docs/GRAVITYBRIDGE/ as the structural reference.

PROJECT_PROFILE must include:
- repository URL/origin;
- absolute local root;
- default branch;
- current technology stack;
- relevant architecture/product/security docs;
- standard validation commands;
- deploy/runtime surfaces if known;
- GravityBridge repository root;
- orchestration readiness status.

CURRENT_STATE must describe facts only. Do not invent product roadmap.

SYNC RULES
- Preserve unrelated dirty/untracked work.
- Do not reset/stash/delete user work without explicit authorization.
- Do not commit/push unless the user/project workflow clearly permits it.
- If project coordinates or Git state are ambiguous, reconcile before writing coordination memory.

STOP
When bootstrap is complete, stop. Do not start product implementation until a separate work objective is provided.

FINAL REPORT
STATUS:
TARGET_REPOSITORY:
LOCAL_ROOT:
ORIGIN:
DEFAULT_BRANCH:
HEAD_SHA:
DIRTY_STATE:
STACK:
VALIDATION_COMMANDS:
PROJECT_CONTRACTS:
GRAVITYBRIDGE_HEALTH:
ANTIGRAVITY_PLUGIN:
PROJECT_MEMORY_CREATED_OR_UPDATED:
DISCREPANCIES:
BLOCKERS:
NEXT_SAFE_ACTION:
```
