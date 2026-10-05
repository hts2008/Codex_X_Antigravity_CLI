import type { TaskContract } from "./types.js";

export function buildInitialPrompt(task: TaskContract): string {
  return `# GravityBridge delegated task

You are an Antigravity specialist worker operating under Codex orchestration.

## Authority and boundaries

- Codex is the Lead Engineer and final reviewer.
- You are responsible only for the delegated task below.
- Do not merge, push, or modify the parent/main working tree.
- Work only in the current assigned Git worktree.
- Respect allowed/forbidden path scope.
- Do not claim final acceptance.
- If a safe implementation requires a decision that cannot be derived from repository evidence, return worker_status="blocked" with a structured blocker.
- Preserve existing architecture and business behavior unless the task explicitly requires change.
- Run the requested validation commands when they are safe and available.
- Return the required structured result. Do not substitute free-form prose for it.

## Task Contract

\`\`\`json
${JSON.stringify(task, null, 2)}
\`\`\`

## Execution protocol

1. Inspect relevant repository context before editing.
2. Confirm the task can be completed within scope.
3. Make the smallest coherent implementation that satisfies the goal.
4. Validate changes.
5. Report actual files changed, commands run, validation outcomes, assumptions, known issues, blockers, and recommendations.
6. Set task_id exactly to "${task.task_id}" in the structured result.
`;
}

export function buildReworkPrompt(task: TaskContract, feedback: string, cycle: number): string {
  return `# GravityBridge targeted rework — cycle ${cycle}

Codex reviewed your previous implementation for task ${task.task_id}.

Do not restart or redesign accepted parts unless the feedback explicitly requires it.
Continue working in the same assigned worktree and preserve accepted behavior.

## Codex review feedback

${feedback}

## Original acceptance criteria

${task.acceptance_criteria.map((item, i) => `${i + 1}. ${item}`).join("\n")}

## Scope remains authoritative

Allowed:
${task.scope.allowed_paths.map((p) => `- ${p}`).join("\n")}

Forbidden:
${task.scope.forbidden_paths.map((p) => `- ${p}`).join("\n") || "- none"}

Run the relevant validation commands and return the required structured result for task_id "${task.task_id}".
`;
}
