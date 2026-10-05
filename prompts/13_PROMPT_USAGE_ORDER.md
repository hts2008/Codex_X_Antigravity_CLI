# Prompt Usage Order

## Default lifecycle

```text
ONE-TIME MACHINE SETUP
GB-H01 MACHINE_BOOTSTRAP
        |
        v
FIRST TIME ON TARGET PROJECT
GB-H02 NEW_PROJECT_BOOTSTRAP
        |
        v
FRESH CODEX SESSION
GB-H03 SESSION_START
        |
        v
NORMAL OBJECTIVE
GB-H04 DAILY_WORK
        |
        +--> Codex direct work
        |
        +--> GravityBridge delegate_and_wait
                 |
                 +--> WORKER_COMPLETED
                 |      -> GB-C-REVIEW
                 |      -> ACCEPT / REWORK / REJECT / TAKEOVER
                 |
                 +--> WORKER_FAILED
                        -> retry_task or takeover
        |
        v
GB-H08 SESSION_CLOSE
```

## Situation matrix

| Situation | Prompt |
|---|---|
| New machine | GB-H01 |
| New target project | GB-H02 |
| New Codex session | GB-H03 |
| Normal work | GB-H04 |
| Worker result exists but review loop was interrupted | GB-H05 |
| Return after interruption/time gap | GB-H06 |
| Git/bridge/memory mismatch | GB-H07 |
| End session/day | GB-H08 |
| Requirement changed | GB-H09 |
| Bug/regression | GB-H10 |
| Merge/release/deploy readiness | GB-H11 |

## Internal routing matrix

| Worker/project state | Codex action |
|---|---|
| No delegation needed | Codex direct |
| Specialist task useful | `delegate_and_wait` |
| `WORKER_COMPLETED` | independent review |
| Review = REWORK | `record_review(REWORK)` then `continue_task` |
| `WORKER_FAILED`, transient | `retry_task` |
| Repeated failure | Codex takeover |
| Worker = BLOCKED, technical decision resolvable from repo | Codex resolves then continue |
| Worker = BLOCKED, product/irreversible decision | Human decision |
| Review = ACCEPT | integrate and verify |
| State mismatch | GB-H07 Sync/Reconcile |
