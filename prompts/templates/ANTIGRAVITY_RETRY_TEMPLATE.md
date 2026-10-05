# GB-A-RETRY — Execution Retry Template

```text
ROLE
Retry execution for task {{TASK_ID}}.

This is an execution/process retry, not a quality rework.

PREVIOUS FAILURE
{{EXECUTION_DIAGNOSTIC}}

RULES
- inspect the current worktree first;
- preserve valid partial work;
- do not broaden scope;
- resolve only the execution failure and complete the original contract;
- use the existing conversation when available;
- remain within max_retries.

Return the required structured result.
```
