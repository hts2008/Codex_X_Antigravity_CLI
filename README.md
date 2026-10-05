# Codex × Antigravity CLI — GravityBridge

Repo này là **control plane** để Codex điều phối Antigravity CLI trong các dự án phần mềm.

Mục tiêu chính:

- **Codex** giữ vai trò Lead Engineer / Orchestrator: hiểu toàn bộ codebase, chia task, quyết định phần nào tự làm và phần nào giao Antigravity, review diff, chạy kiểm thử và quyết định cuối cùng.
- **Antigravity CLI** là specialist worker: UX/UI, frontend, visual QA, design system, codebase research hoặc các task chuyên biệt khác.
- **GravityBridge** là lớp MCP trung gian: tạo worktree cô lập, chạy `agy` ở headless mode, theo dõi `stream-json`, nhận terminal result, lưu logs/result/diff và trả quyền điều khiển cho Codex.
- **Worker SUCCESS không đồng nghĩa task được chấp nhận.** Codex luôn review độc lập trước khi merge.

## Trạng thái

**GravityBridge V1 — implementation scaffold / early usable build**

V1 tập trung vào vòng lặp đồng bộ đáng tin cậy:

```text
User objective
  -> Codex phân tích repo
  -> Codex tạo Task Contract
  -> GravityBridge delegate_and_wait
  -> worktree riêng
  -> Antigravity CLI thực thi
  -> stream-json terminal result
  -> GravityBridge lưu evidence
  -> Codex tiếp tục ngay
  -> Codex review code + diff + tests
  -> ACCEPT hoặc targeted REWORK
```

## Cấu trúc repo

```text
.
├── AGENTS.md
├── FRAMEWORK.md
├── README.md
├── .codex-plugin/
│   └── plugin.json
├── .mcp.json
├── skills/
│   └── antigravity-orchestration/
│       └── SKILL.md
├── protocol/
│   └── SPECIFICATION_V1.md
├── schemas/
│   ├── task.schema.json
│   ├── result.schema.json
│   └── review.schema.json
├── packages/
│   └── gravitybridge/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
├── antigravity-plugin/
│   └── codex-worker/
│       ├── plugin.json
│       ├── rules/
│       ├── skills/
│       └── agents/
├── scripts/
│   ├── setup.ps1
│   ├── setup.sh
│   ├── doctor.ps1
│   └── doctor.sh
└── examples/
    └── task.frontend-ui.json
```

## Yêu cầu

Máy local cần:

- Git
- Node.js 20+ (khuyến nghị Node.js LTS mới)
- npm
- Codex CLI / Codex desktop environment có hỗ trợ MCP/plugin
- Antigravity CLI (`agy`)
- Antigravity đã login ít nhất một lần bằng interactive session

Antigravity headless sử dụng cached credentials. Nếu chưa login, chạy:

```powershell
agy
```

rồi hoàn tất đăng nhập.

## Cài đặt nhanh trên Windows

Clone repo:

```powershell
git clone https://github.com/hts2008/Codex_X_Antigravity_CLI.git
cd Codex_X_Antigravity_CLI
```

Setup:

```powershell
./scripts/setup.ps1
```

Kiểm tra:

```powershell
./scripts/doctor.ps1
```

Setup script sẽ:

1. cài dependencies của GravityBridge;
2. build TypeScript;
3. kiểm tra Git / Node / npm / `agy`;
4. cài/sync Antigravity plugin `codex-worker` bằng `agy plugin install` khi có thể;
5. để repo sẵn sàng cho Codex nạp như orchestration repo.

## Linux / macOS

```bash
./scripts/setup.sh
./scripts/doctor.sh
```

## Cho Codex sử dụng repo này

Khi mở repo này bằng Codex, `AGENTS.md` yêu cầu Codex đọc:

1. `FRAMEWORK.md`
2. `protocol/SPECIFICATION_V1.md`
3. `protocol/PROMPT_SYSTEM.md`
4. `prompts/13_PROMPT_USAGE_ORDER.md`
5. `skills/antigravity-orchestration/SKILL.md`

Repo có Codex compatibility plugin tại `.codex-plugin/plugin.json` và MCP config tại `.mcp.json`.

Nếu runtime không tự nạp local MCP server từ plugin, GravityBridge có thể chạy trực tiếp:

```powershell
node ./packages/gravitybridge/dist/index.js
```

Hoặc đăng ký GravityBridge vào Codex MCP configuration theo đường dẫn local tuyệt đối của file trên.

## Cho Antigravity đồng bộ cách làm việc

Plugin dành cho Antigravity nằm ở:

```text
antigravity-plugin/codex-worker
```

Cài trực tiếp:

```powershell
agy plugin install ./antigravity-plugin/codex-worker
```

Plugin cung cấp:

- worker execution rule;
- orchestrated-task skill;
- UX researcher;
- UI designer;
- frontend specialist;
- design-system specialist;
- visual-QA specialist.

Codex có thể yêu cầu setup/doctor chạy trước khi bắt đầu một project mới.


## Bộ prompt theo vòng đời dự án

Repo hiện có prompt library tại [prompts/](./prompts/).

Thay vì phải copy prompt qua lại giữa Codex và Antigravity, Human chủ yếu nói chuyện với **Codex**; Codex tự gọi Antigravity qua GravityBridge.

Thứ tự khuyến nghị:

```text
Máy mới
  -> GB-H01 Machine Bootstrap

Project mới
  -> GB-H02 New Project Bootstrap
  -> GB-H03 Session Start

Làm việc hằng ngày
  -> GB-H03 Session Start
  -> GB-H04 Daily Work
       -> Codex tự làm hoặc delegate Antigravity
       -> Codex tự review/rework/retry/takeover
  -> GB-H08 Session Close

Quay lại sau gián đoạn
  -> GB-H06 Resume / Recovery

State lệch
  -> GB-H07 Sync / Reconcile

Requirement đổi
  -> GB-H09 Requirement Change

Bug
  -> GB-H10 Debug / Fix

Merge/release
  -> GB-H11 Release Gate
```

Nếu chỉ muốn biết **prompt nào dùng lúc nào**, đọc:

- [prompts/README.md](./prompts/README.md)
- [prompts/12_HUMAN_RUNBOOK.md](./prompts/12_HUMAN_RUNBOOK.md)
- [prompts/13_PROMPT_USAGE_ORDER.md](./prompts/13_PROMPT_USAGE_ORDER.md)

Target project được bootstrap nên có Project Coordination Memory tối giản:

```text
docs/GRAVITYBRIDGE/
  PROJECT_PROFILE.md
  CURRENT_STATE.md
  SESSION_HANDOFF.md
  DECISION_LOG.md
  TASK_LEDGER.md
```

Có thể tạo bộ khung an toàn bằng:

```powershell
./scripts/bootstrap-target.ps1 -TargetRoot "D:\path\to\project"
```

Script chỉ tạo file còn thiếu, không ghi đè memory hiện hữu.

## MCP tools V1

GravityBridge expose:

- `delegate_and_wait`
- `retry_task`
- `continue_task`
- `get_task`
- `get_task_events`
- `get_worker_result`
- `get_task_diff`
- `cancel_task`
- `worker_health`

### Luồng chuẩn

```text
Codex
  |
  +--> worker_health
  |
  +--> delegate_and_wait
  |      |
  |      +--> create isolated git worktree
  |      +--> run agy --output-format stream-json
  |      +--> enforce result.schema.json
  |      +--> capture terminal result
  |      +--> capture diff/events/logs
  |
  +<-- WORKER_COMPLETED / BLOCKED / WORKER_FAILED
  |
  +--> independent review
         |
         +--> ACCEPT
         |
         +--> continue_task(feedback)
         |
         +--> REJECT / Codex takeover
```

## Nguyên tắc quan trọng

### 1. Antigravity không có quyền tự accept

`SUCCESS` của `agy` chỉ là **process-level success**.

### 2. Không cùng sửa một working tree

Mutating task luôn ưu tiên Git worktree riêng.

### 3. Codex kiểm chứng thực tế

Codex phải đọc diff, code thật và chạy validation cần thiết.

### 4. Rework tiếp tục conversation cũ

GravityBridge lưu `conversation_id` và `continue_task` sử dụng lại context của Antigravity.

### 5. Không dùng quyền nguy hiểm mặc định

V1 không tự thêm `--dangerously-skip-permissions`.

## Tài liệu

- Kiến trúc tổng thể: [FRAMEWORK.md](./FRAMEWORK.md)
- Đặc tả kỹ thuật V1: [protocol/SPECIFICATION_V1.md](./protocol/SPECIFICATION_V1.md)
- Codex workflow skill: [skills/antigravity-orchestration/SKILL.md](./skills/antigravity-orchestration/SKILL.md)
- Project bootstrap protocol: [protocol/PROJECT_BOOTSTRAP.md](./protocol/PROJECT_BOOTSTRAP.md)
- Prompt lifecycle system: [protocol/PROMPT_SYSTEM.md](./protocol/PROMPT_SYSTEM.md)
- Human prompt runbook: [prompts/12_HUMAN_RUNBOOK.md](./prompts/12_HUMAN_RUNBOOK.md)
- Task schema: [schemas/task.schema.json](./schemas/task.schema.json)
- Result schema: [schemas/result.schema.json](./schemas/result.schema.json)

## Roadmap

**V1**
- synchronous delegation;
- deterministic completion;
- worktree isolation;
- result schema;
- event log;
- review/rework loop.

**V1.1**
- richer blocker handling;
- cleanup/integration helpers;
- live progress resources;
- stronger path-policy enforcement.

**V2**
- persistent Antigravity sessions;
- asynchronous scheduler;
- Codex app-server supervisor;
- automatic Codex wake/resume;
- dependency DAG;
- parallel independent workers.

> Repo này chủ động giữ **README bằng tiếng Việt**; protocol, schemas, skills, rules, agents và source code dùng **tiếng Anh** để nhất quán với hệ sinh thái kỹ thuật.
