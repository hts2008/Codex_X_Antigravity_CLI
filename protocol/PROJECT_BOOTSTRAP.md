# GravityBridge Project Bootstrap Protocol

**Version:** 1.0.0  
**Audience:** Codex, human operators, Antigravity CLI

## 1. Purpose

This protocol defines the mandatory readiness sequence before Codex delegates the first Antigravity task for a target project.

The goal is to make orchestration repeatable across projects without copying the GravityBridge repository into each product repository.

## 2. Inputs

Codex needs:

- the local path to this GravityBridge repository;
- the local path to the target product repository;
- a working Git installation;
- Node.js/npm;
- Codex with local MCP/plugin support;
- Antigravity CLI (`agy`) installed and authenticated.

## 3. One-time machine setup

From the GravityBridge repository root:

Windows:

```powershell
./scripts/setup.ps1
./scripts/doctor.ps1
```

macOS/Linux:

```bash
./scripts/setup.sh
./scripts/doctor.sh
```

Setup MUST build the GravityBridge MCP server and install/synchronize the Antigravity `codex-worker` plugin unless explicitly skipped.

If Antigravity is not authenticated, open one interactive session:

```text
agy
```

Complete authentication, exit, then rerun the doctor command.

## 4. Codex startup sequence for every target project

Codex SHOULD execute this sequence before the first delegation of a session or whenever environment state is uncertain:

```text
1. Read GravityBridge AGENTS.md
2. Read FRAMEWORK.md
3. Read protocol/SPECIFICATION_V1.md
4. Read protocol/PROMPT_SYSTEM.md
5. Read prompts/13_PROMPT_USAGE_ORDER.md
6. Read skills/antigravity-orchestration/SKILL.md
7. Confirm GravityBridge is built
8. Confirm Antigravity plugin is installed/enabled
9. Inspect the target repository itself
10. Confirm target repository is Git-based
11. Create/update the target project's `docs/GRAVITYBRIDGE/` coordination memory
12. Confirm target working tree is clean for V1 mutating delegation
13. Resolve current HEAD SHA
14. Call GravityBridge worker_health(target_repo)
15. Only then construct the first Task Contract
```

Codex MUST inspect the target repository before asking Antigravity to do so. Delegation does not replace lead-engineer context acquisition.

## 5. Antigravity synchronization check

Codex MAY request these read-only checks through the local shell when diagnosing setup:

```text
agy --version
agy plugin list
agy agents --output-format json
```

The expected plugin is:

```text
codex-worker
```

The expected specialist agent set includes:

- `erp-ux-researcher`
- `ui-designer`
- `frontend-specialist`
- `design-system-specialist`
- `visual-qa`

If the plugin is missing or stale, rerun the setup script or:

```text
agy plugin install <GRAVITYBRIDGE_ROOT>/antigravity-plugin/codex-worker
```

Do not ask Antigravity to modify the GravityBridge protocol ad hoc from inside a product task.

## 6. MCP readiness

The Codex compatibility plugin points to:

```text
.mcp.json
```

and launches:

```text
node ./packages/gravitybridge/dist/index.js
```

If Codex does not automatically load the bundled MCP configuration, register the same stdio server explicitly using an absolute local path.

A healthy MCP tool surface for V1 includes:

- `worker_health`
- `delegate_and_wait`
- `retry_task`
- `continue_task`
- `get_task`
- `get_task_events`
- `get_worker_result`
- `get_task_diff`
- `record_review`
- `cancel_task`

## 7. Project Coordination Memory

A bootstrapped target project SHOULD have:

```text
docs/GRAVITYBRIDGE/
├── PROJECT_PROFILE.md
├── CURRENT_STATE.md
├── SESSION_HANDOFF.md
├── DECISION_LOG.md
└── TASK_LEDGER.md
```

Use `project-template/docs/GRAVITYBRIDGE/` as the baseline.

The framework provides safe scaffold scripts:

Windows:

```powershell
./scripts/bootstrap-target.ps1 -TargetRoot "<TARGET_PROJECT_ROOT>"
```

macOS/Linux:

```bash
./scripts/bootstrap-target.sh "<TARGET_PROJECT_ROOT>"
```

The bootstrap scripts MUST NOT overwrite existing coordination-memory files by default.

This project memory is for cross-session coordination facts. Detailed worker execution evidence remains in `~/.gravitybridge/`.

## 8. Target-repository preflight

For V1 mutating tasks, Codex MUST verify:

- target repository HEAD is committed;
- working tree is clean;
- `base_sha` in the Task Contract is current HEAD;
- task scope is explicit;
- forbidden paths are explicit when meaningful;
- acceptance criteria are testable;
- validation commands are appropriate for that repository.

If the target tree is dirty, Codex SHOULD commit/stash only when that is consistent with the user's workflow. GravityBridge V1 does not silently copy uncommitted changes into worker worktrees.

## 9. First delegation handshake

Recommended first sequence:

```text
Codex -> worker_health
GravityBridge -> environment evidence
Codex -> delegate_and_wait(Task Contract)
GravityBridge -> isolated worktree
GravityBridge -> Antigravity headless worker
Antigravity -> init / step_update* / result
GravityBridge -> worker evidence
Codex -> independent code/diff/test review
Codex -> record_review
```

For process/execution failure:

```text
WORKER_FAILED
  -> Codex diagnoses evidence
  -> retry_task if transient/retryable and budget remains
  -> otherwise TAKEOVER
```

For implementation defects:

```text
WORKER_COMPLETED
  -> Codex review
  -> record_review(REWORK)
  -> continue_task(targeted feedback)
  -> same Antigravity conversation
```

## 10. Project-local additions

A target product repository MAY add its own:

- `AGENTS.md`;
- Antigravity rules;
- design-system documentation;
- architecture decision records;
- test instructions;
- project-specific worker agents.

Those project-local instructions supplement the GravityBridge protocol. They MUST NOT invert the core authority model:

```text
Codex = orchestration + review + integration authority
Antigravity = bounded specialist execution
GravityBridge = deterministic coordination/evidence
```

## 11. Definition of ready

A target project is ready for Codex ↔ Antigravity orchestration when:

- GravityBridge MCP starts successfully;
- `worker_health` reports Git, Node, and `agy` available;
- Antigravity authentication is valid;
- `codex-worker` plugin is installed/enabled;
- target repo is understood by Codex;
- target `docs/GRAVITYBRIDGE/` coordination state exists and is coherent when the project uses durable recovery;
- target repo is in an acceptable Git state;
- Task Contract can be created from a concrete current base SHA.
