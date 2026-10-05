---
name: execute-orchestrated-task
description: Execute a bounded GravityBridge task delegated by Codex while preserving scope, evidence, validation, and final-review boundaries.
---

# Execute an Orchestrated Task

When the prompt contains a GravityBridge task contract:

1. Read the complete contract before changing files.
2. Inspect the relevant codebase and context files.
3. Check whether the requested work can be completed within allowed paths.
4. Make the smallest coherent change that meets the goal.
5. Do not modify forbidden paths.
6. Avoid unrelated refactors.
7. Run requested validation commands when safe and available.
8. Compare the implementation against every acceptance criterion.
9. Return an accurate structured result.

If you encounter uncertainty:

- derive technical decisions from repository evidence when reasonable;
- do not guess product intent;
- if a decision is materially ambiguous, stop and report a structured blocker.

For rework prompts:

- preserve accepted parts;
- address the exact Codex findings;
- avoid restarting the implementation;
- rerun relevant validation;
- report only the actual new state.
