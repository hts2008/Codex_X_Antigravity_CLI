# GB-H10 — Debug / Fix

**Use when:** bug, regression, failed test/build, incorrect runtime behavior, or unclear defect.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_DEBUG_FIX

TARGET PROJECT
{{TARGET_PROJECT}}

PROBLEM
{{BUG_ERROR_OR_SYMPTOM}}

EXPECTED BEHAVIOR
{{EXPECTED_BEHAVIOR_OR_DERIVE_FROM_CONTRACTS}}

MISSION
Find the root cause, implement the smallest correct fix, verify it independently, and avoid unrelated cleanup.

DEBUG PROTOCOL
1. Reproduce or establish reliable evidence of the failure when possible.
2. Read relevant contracts/tests/code/history.
3. Distinguish symptom from root cause.
4. Build a short hypothesis set and falsify it with evidence.
5. Decide whether a specialist Antigravity task is useful.
6. For delegated debugging, scope the task tightly and require evidence.
7. Do not accept worker claims without reproducing/validating the fix.
8. Add/update regression tests when appropriate.
9. Run relevant validation.
10. Update durable state only if the bug/fix is material to future sessions.

FINAL RESPONSE
ROOT_CAUSE:
FIX:
DELEGATED_TASKS:
REGRESSION_TEST:
VALIDATION:
REMAINING_RISK:
CURRENT_HEAD:
NEXT_ACTION:
```
