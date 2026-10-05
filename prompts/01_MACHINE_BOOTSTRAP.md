# GB-H01 — Machine Bootstrap

**Use when:** first installation on a machine, after reinstalling Codex/Antigravity, or after major environment changes.

Copy/paste to Codex:

```text
Apply prompts/00_COMMON_OPERATING_CONTRACT.md.

MODE: GRAVITYBRIDGE_MACHINE_BOOTSTRAP

GRAVITYBRIDGE REPOSITORY
- Repository: https://github.com/hts2008/Codex_X_Antigravity_CLI
- Local root: {{GRAVITYBRIDGE_LOCAL_ROOT_OR_AUTO_DISCOVER}}

ROLE
You are Codex acting as the Lead Engineer responsible for preparing the local Codex × GravityBridge × Antigravity toolchain.

MISSION
Make this machine ready to orchestrate Antigravity CLI through GravityBridge. This prompt authorizes environment/bootstrap work only, not product implementation.

PROCEDURE
1. Locate or clone the GravityBridge repository.
2. Read AGENTS.md, FRAMEWORK.md, protocol/SPECIFICATION_V1.md, protocol/PROJECT_BOOTSTRAP.md and the orchestration skill.
3. Inspect the machine for:
   - git
   - node
   - npm
   - Codex local MCP support
   - agy
4. Run the platform-appropriate setup script.
5. Build/typecheck GravityBridge.
6. Ensure Antigravity is authenticated; if interactive login is required, report the exact user action required and stop only for that action.
7. Install/synchronize the codex-worker Antigravity plugin.
8. Verify expected specialist agents are visible.
9. Run the doctor script.
10. Verify the GravityBridge MCP server can be launched locally.
11. Do not modify any unrelated product repository.

FINAL REPORT
STATUS:
GRAVITYBRIDGE_ROOT:
GRAVITYBRIDGE_HEAD:
NODE:
GIT:
AGY:
AGY_AUTH:
CODEX_WORKER_PLUGIN:
SPECIALIST_AGENTS:
MCP_SERVER:
BUILD_TYPECHECK:
DOCTOR:
BLOCKERS:
NEXT_SAFE_ACTION:
```
