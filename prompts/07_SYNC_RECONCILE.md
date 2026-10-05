# GB-H07 — Sync / Reconcile

**Use when:** local repo, remote repo, durable project memory and GravityBridge task state may disagree.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_SYNC_RECONCILE

TARGET PROJECT
{{TARGET_PROJECT}}

MISSION
Reconcile actual repository state, remote/default branch state, GravityBridge task/worktree state, and docs/GRAVITYBRIDGE durable coordination memory. Do not make unrelated product changes.

CHECK
1. Verify repository root and origin.
2. Fetch/prune when safe.
3. Record:
   - current branch;
   - local HEAD;
   - upstream HEAD;
   - default branch HEAD;
   - dirty/untracked files.
4. Preserve unrelated human work.
5. Read PROJECT_PROFILE, CURRENT_STATE, SESSION_HANDOFF and TASK_LEDGER.
6. Inspect all referenced active GravityBridge tasks/worktrees.
7. Compare:
   - recorded base SHA vs actual;
   - task branch/worktree vs actual;
   - accepted/reviewed SHA vs current code;
   - bridge state vs durable ledger;
   - project-memory claims vs Git evidence.
8. Classify each discrepancy:
   - harmless stale metadata;
   - needs memory update;
   - needs review;
   - needs rebase/reconcile;
   - needs Human decision.
9. Repair coordination metadata when factual and safe.
10. Do not rebase/reset/force-push/delete work without authorization.

FINAL RESPONSE
SYNC_STATUS:
LOCAL_HEAD:
UPSTREAM_HEAD:
DEFAULT_HEAD:
DIRTY_STATE:
BRIDGE_TASK_STATE:
DISCREPANCIES:
REPAIRS_APPLIED:
UNRESOLVED_CONFLICTS:
NEXT_SAFE_ACTION:
```
