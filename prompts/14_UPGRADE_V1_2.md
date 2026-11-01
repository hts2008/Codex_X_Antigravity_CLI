# GB-H14 — Upgrade an existing machine + project to GravityBridge V1.2

**Use when:** the machine and/or a target project were set up with an older GravityBridge (V1.0 `delegate_and_wait`, 5 "specialist" Antigravity agents, always-on worker rule) or V1.1, and Codex has not yet been switched to V1.2.

**Before pasting:** the repo owner has merged the V1.2 pull request on GitHub. Replace `{{TARGET_PROJECT_PATH}}` with the project folder (or leave the placeholder: Codex will ask).

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_UPGRADE_V1_2

INPUTS
- GravityBridge repository: https://github.com/hts2008/Codex_X_Antigravity_CLI (local clone: auto-discover; ask me if you cannot find it)
- Target project(s): {{TARGET_PROJECT_PATH}}
- Human: not a programmer. Report in simple Vietnamese. Ask me only for actions only I can do (login, approvals, decisions), one clear step at a time.

ROLE
You are Codex, Lead Engineer and Orchestrator. Antigravity CLI is a coding worker only (agents gb-coder, gb-frontend-coder), driven exclusively through the GravityBridge MCP tools. This prompt authorizes toolchain upgrade and alignment of GravityBridge instructions/memory in the target project. It does NOT authorize product code changes, merges of worker branches, pushes, or deleting branches, worktrees or task evidence.

PHASE A — Read-only inventory (change nothing yet)
1. GravityBridge clone: path, `git status`, branch, HEAD, `packages/gravitybridge/package.json` version. `git fetch origin`, then confirm origin/main has version 1.2.0. If not: STOP and tell me to merge the V1.2 pull request first.
2. Local changes in the clone: if any, STOP and show them. Do not discard them.
3. Current machine wiring:
   - `codex mcp list` / `codex mcp get gravitybridge` (where it points).
   - `agy --version`, `agy plugin list` (codex-worker present? which agents?).
   - Antigravity hooks file entry for GravityBridge (setup reports its path).
   - `~/.agents/skills/antigravity-orchestration/SKILL.md` header version.
   - `~/.gravitybridge/tasks`: number of task folders; any with state RUNNING; any live `agy` processes.
4. If an `agy` process from an old task is still running, STOP and ask me before stopping it.

PHASE B — Upgrade the toolchain
5. In the clone: `git checkout main`, `git pull --ff-only`.
6. Run `scripts\setup.ps1` (macOS/Linux: `scripts/setup.sh`), then `scripts\doctor.ps1`. All checks must be [OK]. On [FAIL], follow the hint printed below it; if it needs me, ask.
7. Verify after setup:
   - `codex mcp get gravitybridge` points to `<clone>/packages/gravitybridge/dist/index.js`.
   - `agy plugin list`: codex-worker contains only gb-coder and gb-frontend-coder. The V1.0 agents (design-system-specialist, erp-ux-researcher, frontend-specialist, ui-designer, visual-qa), the always-on rule `orchestration-worker` and the plugin skill `execute-orchestrated-task` must be gone. If any copy remains outside the plugin (search the Antigravity config folders for these names), list it with its path and ask me before deleting.
   - The installed skill says "GravityBridge V1.2" and contains the "Token efficiency" section.
8. Run `scripts\smoke.ps1` (one tiny real Antigravity task in a temp repo). It must end with five [OK] lines. On [FAIL], STOP and show me the full output.
9. Tell me to restart Codex. After the restart, call `worker_health` (with repo_path = target project) and `list_tasks(repo_path)` to prove the V1.2 tools are live.

PHASE C — Align the target project (repeat per target project)
10. Target repo: `git status` (must be clean before any later start_task), branch, HEAD.
11. Old work: from `list_tasks` read `legacy_v1_0` (V1.0 tasks are read-only now). With git list every `gb/*` branch and whether it is merged into the current branch (`git branch --list "gb/*" --no-merged`). Make a table: task_id, old state, branch merged yes/no, recommendation (already merged → branch can be deleted; ACCEPTED but not merged → review and merge manually; unfinished → redo as a new V1.2 task or drop). Do not merge or delete anything; ask me.
12. Instruction files: read the target's AGENTS.md (and GEMINI.md / .agents rules if present) and `docs/GRAVITYBRIDGE/*`. If `docs/GRAVITYBRIDGE/` is missing, run `scripts\bootstrap-target.ps1 -TargetRoot <target>` (it never overwrites). Replace everything that describes the old workflow (delegate_and_wait, synchronous waiting, specialist/designer Antigravity agents, Antigravity as planner/reviewer) with the V1.2 rules below. Keep project-specific facts and decisions unchanged.
13. Add this section to the target AGENTS.md (or update it if present):

    ## GravityBridge V1.2 operating rules
    - Codex decides, delegates, reviews and integrates. Antigravity only codes, only via the GravityBridge MCP tools (skill antigravity-orchestration). Never run agy directly for project work.
    - Loop: commit first (clean repo) → start_task → await_task until not RUNNING → review evidence + real diff → record_review → integrate with git merge --squash gb/<task_id>, verify, commit → cleanup_task.
    - Task contracts: plain sentences (never compress or glue words, never refer to other work only by number); exact files and symbols in context; facts you already know in notes; related_tasks for follow-up work; narrowest scope; checkable acceptance criteria; quiet targeted validation commands; worker.effort medium unless the logic is tricky.
    - Group small edits on the same files into one task; split only by independent area.
    - Read contract_warnings (start_task) and efficiency_warnings/usage (await_task) and improve the next contract.
    - Budget stop = the task was too vague or too big: rewrite it as a new narrower task with related_tasks, or TAKEOVER. Do not just retry.
    - Small review findings (a few lines): fix them yourself after ACCEPT or TAKEOVER; use REWORK only for non-trivial fixes.
    - Never reuse a task_id, including V1.0 ones.
    - Record tokens per task (from get_task usage) in docs/GRAVITYBRIDGE/TASK_LEDGER.md.
14. Update `docs/GRAVITYBRIDGE/CURRENT_STATE.md`, `SESSION_HANDOFF.md`, `DECISION_LOG.md` (decision: "Upgraded to GravityBridge V1.2; V1.0 tasks read-only") factually.
15. Show me the diff summary of these instruction/memory files, then commit them in the target repo as `chore: align GravityBridge instructions to V1.2`. Do not push unless I say so.

PHASE D — Optional, ask first
16. If a local monitoring dashboard reads `~/.gravitybridge`, check it still works. V1.2 adds `usage_total` in metadata.json and `usage`, `tool_counts`, `budget_stop` per turn (turns/*.json); offer to show them. Do not change it without my approval.

FINAL REPORT (Vietnamese, simple)
TRẠNG THÁI:
PHIÊN BẢN GRAVITYBRIDGE (trước → sau):
CODEX MCP:
ANTIGRAVITY PLUGIN / AGENTS:
SKILL:
DOCTOR:
SMOKE:
VIỆC CŨ V1.0 (bảng ở bước 11):
FILE HƯỚNG DẪN ĐÃ CẬP NHẬT + COMMIT:
VIỆC ANH CẦN LÀM:
BƯỚC AN TOÀN TIẾP THEO:
```
