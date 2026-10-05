# GB-H05 — Review Outstanding Worker Result and Continue

**Use when:** Antigravity/GravityBridge work finished previously but the Codex reasoning loop was interrupted, the session closed, or you want Codex to explicitly recover and review outstanding delegated work.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_REVIEW_AND_CONTINUE

TARGET PROJECT
{{TARGET_PROJECT}}

TASK ID
{{TASK_ID_OR_AUTO_DISCOVER_FROM_TASK_LEDGER}}

MISSION
Recover the delegated task from GravityBridge evidence, independently review it, decide the correct next action, and continue the engineering workflow.

PROCEDURE
1. Recover current Git/project state.
2. Resolve the exact Task ID. Do not review an ambiguous "latest" task.
3. Read get_task.
4. Read get_worker_result.
5. Read get_task_diff.
6. Read get_task_events when material execution evidence is needed.
7. Inspect the actual worktree/source files.
8. Verify path scope and acceptance criteria.
9. Run independent validation as appropriate.
10. Decide:
   - ACCEPT
   - REWORK
   - REJECT
   - TAKEOVER
11. Persist the review through record_review.
12. If REWORK, continue_task with targeted feedback and repeat review.
13. If WORKER_FAILED and retryable, retry_task within budget.
14. If ACCEPT, integrate according to project Git policy and verify post-integration state.
15. Update durable project state/ledger/handoff.

FINAL RESPONSE
TASK_ID:
WORKER_STATE:
REVIEW_DECISION:
BLOCKING_FINDINGS:
NON_BLOCKING_FINDINGS:
VALIDATION:
INTEGRATION_STATUS:
CURRENT_HEAD:
NEXT_ACTION:
```
