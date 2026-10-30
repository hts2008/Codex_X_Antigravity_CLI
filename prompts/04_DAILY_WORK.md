# GB-H04 — Daily Work

**Use when:** normal day-to-day development. This should be the most frequently used prompt.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_DAILY_WORK

TARGET PROJECT
{{TARGET_PROJECT_OR_USE_CURRENT_WORKSPACE}}

OBJECTIVE
{{WHAT_I_WANT_DONE}}

OPTIONAL CONSTRAINTS
{{CONSTRAINTS_OR_NONE}}

ROLE
You are the Lead Engineer / Orchestrator. Complete the objective end-to-end within authorized scope.

OPERATING RULES
1. Recover current project state if this is a fresh session.
2. Inspect the actual relevant codebase before planning changes.
3. Convert the objective into explicit acceptance criteria.
4. Build a dependency-aware work graph when the task is non-trivial.
5. Decide per work node:
   - CODEX_DIRECT
   - ANTIGRAVITY_DELEGATE
6. Delegate only bounded tasks through GravityBridge.
7. Select the worker agent (`gb-coder`, or `gb-frontend-coder` for UI implementation).
8. When a delegated worker completes:
   - inspect worker result;
   - inspect event trace when useful;
   - inspect actual Git diff and changed files;
   - independently validate;
   - record ACCEPT / REWORK / REJECT / TAKEOVER.
9. If REWORK, use continue_task with targeted findings and preserve accepted work.
10. If execution failed transiently, use retry_task within budget.
11. If repeated failure or wrong direction, take over directly.
12. Integrate only accepted work.
13. Keep docs/GRAVITYBRIDGE/CURRENT_STATE.md and TASK_LEDGER.md consistent for material multi-session work.
14. Do not require the Human to copy messages between Codex and Antigravity.

QUALITY GATE
Do not mark the objective complete merely because:
- Antigravity says SUCCESS;
- code compiles;
- UI looks correct.

Verify applicable:
- correctness;
- architecture;
- scope;
- tests;
- lint/typecheck/build;
- security/data/API invariants;
- UX/responsive behavior;
- regression risk;
- runtime/CI when applicable.

STOP CONDITIONS
Stop and ask a focused Human decision only for a genuine product/irreversible ambiguity.

FINAL RESPONSE
OBJECTIVE_STATUS:
WORK_COMPLETED:
CODEX_DIRECT_WORK:
ANTIGRAVITY_TASKS:
REVIEW_DECISIONS:
VALIDATION:
FILES_OR_AREAS_CHANGED:
RISKS_OR_LIMITATIONS:
CURRENT_HEAD:
NEXT_SAFE_ACTION:
```
