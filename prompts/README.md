# Bộ prompt vận hành Codex × Antigravity CLI

Thư mục này là **prompt lifecycle library** cho GravityBridge.

Khác với workflow phải copy prompt thủ công giữa hai AI, kiến trúc này dùng:

- **Human → Codex**: prompt vòng đời dự án.
- **Codex → GravityBridge → Antigravity CLI**: giao việc tự động qua MCP/CLI.
- **Codex** tự review kết quả Antigravity, tự quyết định retry/rework/takeover.
- Human không cần làm “message relay” giữa Codex và Antigravity.

## Thứ tự dùng nhanh

### Máy mới / cài lần đầu

Dùng:

`01_MACHINE_BOOTSTRAP.md`

Chỉ chạy một lần cho mỗi máy hoặc khi môi trường bị thay đổi lớn.

### Project mới chưa dùng GravityBridge

Dùng:

`02_NEW_PROJECT_BOOTSTRAP.md`

Prompt này yêu cầu Codex:

- nạp framework;
- inspect target repo;
- sync Antigravity plugin;
- chạy health/preflight;
- tạo Project Coordination Memory;
- không bắt đầu product implementation nếu chưa có yêu cầu riêng.

### Mở một session Codex mới trong project đã bootstrap

Dùng:

`03_SESSION_START.md`

Đây là prompt mở đầu khuyến nghị cho mỗi fresh Codex session.

### Làm việc hằng ngày

Dùng:

`04_DAILY_WORK.md`

Chỉ cần thay phần `OBJECTIVE`.

Codex phải tự:

- hiểu task;
- đọc codebase;
- quyết định tự làm hay delegate;
- dùng Antigravity nếu có lợi;
- review kết quả worker;
- tiếp tục loop cho tới khi đạt acceptance criteria hoặc gặp decision blocker thật sự.

### Antigravity vừa hoàn tất nhưng Codex session bị gián đoạn / đã đóng

Dùng:

`05_REVIEW_AND_CONTINUE.md`

### Quay lại project sau thời gian dài / mất context

Dùng:

`06_RESUME_RECOVERY.md`

### Nghi ngờ branch, SHA, state hoặc bridge metadata bị lệch

Dùng:

`07_SYNC_RECONCILE.md`

### Kết thúc ngày làm việc / đóng session

Dùng:

`08_SESSION_CLOSE.md`

### Requirement thay đổi giữa chừng

Dùng:

`09_REQUIREMENT_CHANGE.md`

### Bug / regression / build failure

Dùng:

`10_DEBUG_FIX.md`

### Chuẩn bị merge/release/deploy

Dùng:

`11_RELEASE_GATE.md`

### Nếu không nhớ prompt nào dùng khi nào

Đọc:

`12_HUMAN_RUNBOOK.md`
`13_PROMPT_USAGE_ORDER.md`

## Luồng mặc định

```text
NEW MACHINE
  -> 01 Machine Bootstrap

NEW PROJECT
  -> 02 Project Bootstrap
  -> 03 Session Start

NORMAL DAY
  -> 03 Session Start
  -> 04 Daily Work
       -> Codex direct work OR
       -> GravityBridge -> Antigravity
       -> Codex review
       -> rework/retry/takeover automatically
  -> 08 Session Close

INTERRUPTED / DAYS LATER
  -> 06 Resume Recovery
  -> 04 Daily Work

STATE MISMATCH
  -> 07 Sync/Reconcile

REQUIREMENT CHANGED
  -> 09 Requirement Change

BUG
  -> 10 Debug/Fix

RELEASE
  -> 11 Release Gate
```

## Prompt IDs

Human-facing lifecycle prompts use IDs:

```text
GB-H01 ... GB-H11
```

Internal canonical templates use:

```text
GB-A-TASK
GB-A-REWORK
GB-A-RETRY
GB-C-REVIEW
GB-C-HANDOFF
```

These IDs are prompt-type identifiers, not task IDs. Runtime delegated work still receives its own unique `task_id`.

## Project Coordination Memory

For durable cross-session recovery, bootstrapped target projects SHOULD contain:

```text
docs/GRAVITYBRIDGE/
  PROJECT_PROFILE.md
  CURRENT_STATE.md
  SESSION_HANDOFF.md
  DECISION_LOG.md
  TASK_LEDGER.md
```

This is intentionally much lighter than the execution archive in GPT_X_Gemini.

Detailed worker events, stdout/stderr, result contracts and diffs remain in GravityBridge runtime storage under `~/.gravitybridge/`.

The project files preserve only **durable coordination state** that future Codex sessions need.
