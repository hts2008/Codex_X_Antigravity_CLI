# GB-H06 — Resume / Recovery

**Use when:** returning after hours/days, after Codex restart, after terminal interruption, or when you do not trust chat memory.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_RESUME_RECOVERY

TARGET PROJECT
{{TARGET_PROJECT}}

LAST KNOWN CONTEXT
{{OPTIONAL_FREEFORM_HINT_OR_NONE}}

MISSION
Recover project/work state from durable evidence and reconstruct completed vs remaining authorized work. Do not rely on old chat memory as the source of truth.

RECOVERY
1. Read target AGENTS.md.
2. Read docs/GRAVITYBRIDGE/PROJECT_PROFILE.md.
3. Read CURRENT_STATE.md and SESSION_HANDOFF.md.
4. Read recent DECISION_LOG.md and TASK_LEDGER.md entries.
5. Inspect actual Git branch, HEAD, status and recent history.
6. Reconcile recorded active Task IDs with GravityBridge task metadata.
7. For each active/non-terminal task, inspect:
   - state;
   - worktree path;
   - conversation ID availability;
   - worker result/events/diff;
   - retry/rework budgets.
8. Determine:
   - completed and accepted;
   - worker-completed but not reviewed;
   - changes requested;
   - worker failed;
   - blocked;
   - abandoned/stale.
9. Do not silently resume stale authorization if requirements changed.
10. If state is coherent, continue from the next safe action.
11. If state mismatch is material, enter SYNC_RECONCILE.

FINAL RESPONSE
RECOVERY_STATUS:
BRANCH:
HEAD_SHA:
DURABLE_STATE:
ACTIVE_TASKS:
OUTSTANDING_REVIEWS:
REWORK_OR_RETRY_REQUIRED:
STALE_OR_AMBIGUOUS_ITEMS:
DISCREPANCIES:
RECOVERED_NEXT_ACTION:
```
