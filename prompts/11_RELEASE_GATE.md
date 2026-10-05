# GB-H11 — Merge / Release Gate

**Use when:** preparing merge, release, deployment, or other high-impact integration.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_RELEASE_GATE

TARGET PROJECT
{{TARGET_PROJECT}}

CANDIDATE
{{BRANCH_PR_SHA_VERSION_OR_AUTO_DISCOVER}}

MISSION
Independently verify the exact candidate before merge/release/deploy. Do not approve "latest" without resolving an exact SHA.

GATE
1. Resolve exact candidate SHA.
2. Verify all relevant GravityBridge tasks have final Codex review decisions.
3. Ensure no WORKER_COMPLETED task is being treated as accepted without review.
4. Verify required tests/lint/typecheck/build.
5. Verify security/data/API/migration risks.
6. Verify UX/runtime/preview smoke where applicable.
7. Check unresolved blockers and known issues.
8. Check release notes/migrations/rollback/observability when applicable.
9. Confirm target branch and merge/release policy.
10. Do not deploy production unless explicitly authorized.

VERDICT
Use one:
- READY
- NOT_READY
- NEEDS_DECISION
- NEEDS_RECONCILE
- NEEDS_VERIFICATION

FINAL RESPONSE
CANDIDATE_SHA:
VERDICT:
REQUIRED_CHECKS:
PASSED:
FAILED:
NOT_RUN:
BLOCKERS:
KNOWN_RISKS:
MERGE_RELEASE_ACTION:
NEXT_SAFE_ACTION:
```
