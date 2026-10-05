# GB-C-REVIEW — Codex Independent Worker Review Template

```text
TASK
{{TASK_ID}}

EVIDENCE TO READ
- get_task
- get_worker_result
- get_task_diff
- get_task_events when useful
- actual changed files/worktree
- target project contracts/tests

REVIEW MATRIX
1. Acceptance criterion -> evidence -> PASS/FAIL/NOT_VERIFIED.
2. Scope compliance.
3. Correctness.
4. Architecture.
5. Business/API/data/security invariants.
6. Maintainability.
7. Tests/lint/typecheck/build.
8. UX/visual/responsive criteria when applicable.
9. Worker claims vs actual Git evidence.
10. Regression risk.

DECISION
Exactly one:
- ACCEPT
- REWORK
- REJECT
- TAKEOVER

If REWORK:
- write precise blocking findings;
- preserve accepted work;
- use continue_task.

If execution failure:
- do not call it REWORK;
- diagnose and use retry_task only if retryable.

Never approve solely because worker_status=completed.
```
