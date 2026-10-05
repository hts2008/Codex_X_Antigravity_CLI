# GB-H09 — Requirement Change

**Use when:** the user changes scope, behavior, UI requirements, architecture constraints, or acceptance criteria after work has already started.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_REQUIREMENT_CHANGE

TARGET PROJECT
{{TARGET_PROJECT}}

OLD REQUIREMENT / CURRENT BEHAVIOR
{{OLD_REQUIREMENT_OR_REFERENCE}}

NEW REQUIREMENT
{{NEW_REQUIREMENT}}

MISSION
Assess the impact of this requirement change against current repository state, accepted work, active GravityBridge tasks and project contracts before implementation.

PROCEDURE
1. Recover current state.
2. Identify affected contracts, components, APIs, tests, migrations, UX, tasks and accepted SHAs.
3. Identify active delegated tasks whose authorization is now stale.
4. Do not continue a stale Antigravity task unchanged.
5. Decide which current work can be preserved vs invalidated.
6. Update acceptance criteria/work graph.
7. Record a concise durable requirement/decision entry when material.
8. Execute the revised plan using normal Codex-direct/delegated workflow.
9. Independently review all worker results.

FINAL RESPONSE
CHANGE_IMPACT:
INVALIDATED_ASSUMPTIONS:
AFFECTED_TASKS:
PRESERVED_WORK:
REWORK_REQUIRED:
NEW_ACCEPTANCE_CRITERIA:
IMPLEMENTATION_STATUS:
VALIDATION:
NEXT_ACTION:
```
