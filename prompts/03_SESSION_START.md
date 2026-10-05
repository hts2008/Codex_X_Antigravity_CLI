# GB-H03 — Fresh Session Start

**Use when:** opening a new Codex session in a project already bootstrapped with GravityBridge.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_SESSION_START

TARGET PROJECT
- Local root or repository: {{TARGET_PROJECT}}

MISSION
Recover the current project state and prepare this Codex session for engineering work. Do not perform new product changes unless an objective is included below.

OPTIONAL OBJECTIVE
{{OBJECTIVE_OR_NONE}}

RECOVERY PROCEDURE
1. Read target AGENTS.md.
2. Read docs/GRAVITYBRIDGE/PROJECT_PROFILE.md.
3. Read docs/GRAVITYBRIDGE/CURRENT_STATE.md.
4. Read docs/GRAVITYBRIDGE/SESSION_HANDOFF.md.
5. Read relevant recent entries in DECISION_LOG.md and TASK_LEDGER.md.
6. Inspect actual Git branch, HEAD, status and recent commits.
7. Compare durable coordination state against repository reality.
8. If active GravityBridge task IDs are recorded, inspect their current local bridge state/result/diff as needed.
9. Run worker_health if Antigravity delegation may be needed or environment state is uncertain.
10. Identify discrepancies explicitly.

If durable memory and Git reality materially disagree:
- enter SYNC_RECONCILE mode before dependent work.

If OBJECTIVE is provided and state is coherent:
- analyze the objective;
- build a work plan;
- decide what Codex should do directly vs delegate to Antigravity;
- proceed without asking the Human to relay messages between agents.

FINAL STARTUP REPORT
SESSION_STATUS:
BRANCH:
HEAD_SHA:
DIRTY_STATE:
CURRENT_MILESTONE:
ACTIVE_TASKS:
OPEN_BLOCKERS:
LAST_HANDOFF:
BRIDGE_HEALTH:
DISCREPANCIES:
PLAN_FOR_OBJECTIVE:
NEXT_ACTION:
```
