# GB-H08 — Session Close / Handoff

**Use when:** finishing a working session or the end of the day.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_SESSION_CLOSE

TARGET PROJECT
{{TARGET_PROJECT_OR_CURRENT_WORKSPACE}}

MISSION
Close the current engineering session cleanly so a fresh Codex session can recover without relying on chat history.

PROCEDURE
1. Inspect current Git state.
2. Resolve status of every task touched this session.
3. Ensure no worker result is incorrectly treated as accepted.
4. Record exact accepted/reviewed SHAs where relevant.
5. Update docs/GRAVITYBRIDGE/CURRENT_STATE.md with factual current state.
6. Update TASK_LEDGER.md for material tasks.
7. Append material durable decisions to DECISION_LOG.md.
8. Replace SESSION_HANDOFF.md with a concise recovery-oriented handoff:
   - what was completed;
   - what was reviewed/accepted;
   - what remains;
   - active task IDs;
   - open blockers;
   - exact branch/SHA;
   - validation status;
   - next safe action.
9. Do not store private chain-of-thought.
10. Do not commit/push unless authorized by current project workflow.

FINAL RESPONSE
SESSION_CLOSE_STATUS:
BRANCH:
HEAD_SHA:
COMPLETED:
ACTIVE_OR_PENDING:
BLOCKERS:
VALIDATION_STATE:
DURABLE_FILES_UPDATED:
NEXT_SESSION_START:
```
