# Codex × Antigravity CLI — GravityBridge

Repo này giúp **Codex** điều phối **Antigravity CLI** khi làm phần mềm:

- **Codex = trưởng nhóm kỹ thuật.** Hiểu codebase, ra mọi quyết định, chia việc, viết "hợp đồng công việc" (Task Contract), review và quyết định chấp nhận / yêu cầu sửa / tự làm lại.
- **Antigravity CLI = thợ code.** Chỉ viết code đúng theo chỉ thị của Codex, trong một bản sao cô lập (worktree). Không tự quyết thiết kế, không merge, không push.
- **GravityBridge = cầu nối (MCP server).** Tạo bản sao cô lập, chạy Antigravity ở chế độ nền, chặn ghi file ngoài phạm vi, tự chụp lại toàn bộ thay đổi, tự chạy lại lệnh kiểm tra, và báo kết quả có bằng chứng cho Codex.

> "Antigravity báo xong" **không** có nghĩa là xong. Chỉ khi Codex review bằng chứng và chấp nhận thì mới tính.

Trạng thái: **V1.1** — vòng lặp bất đồng bộ, có kiểm thử tự động trên Linux + Windows. Xem kế hoạch và lý do thay đổi ở [docs/IMPROVEMENT_PLAN.md](./docs/IMPROVEMENT_PLAN.md).

---

## 1. Cài đặt (làm 1 lần trên mỗi máy)

Cần có sẵn: **Git**, **Node.js 22+**, **Antigravity CLI (`agy`)** đã đăng nhập (mở terminal gõ `agy` một lần), và **Codex** (CLI hoặc app).

Mở PowerShell tại thư mục repo này và chạy:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1
powershell -ExecutionPolicy Bypass -File scripts\smoke.ps1
```

macOS / Linux:

```bash
./scripts/setup.sh && ./scripts/doctor.sh && ./scripts/smoke.sh
```

Ý nghĩa:

| Lệnh | Làm gì |
|---|---|
| `setup` | Cài thư viện, build, đăng ký **hook chặn phạm vi** vào Antigravity, cài plugin worker `codex-worker`, chép skill cho Codex, đăng ký MCP server `gravitybridge` với Codex. Chạy lại sau mỗi lần cập nhật repo (`git pull`). |
| `doctor` | Kiểm tra mọi thứ. Dòng `[FAIL]` kèm gợi ý cách sửa ngay bên dưới. |
| `smoke` | Giao cho Antigravity **một việc nhỏ thật** trong repo tạm, kiểm tra toàn bộ cơ chế an toàn. Cuối cùng phải thấy 5 dòng `[OK]`. Nếu có `[FAIL]`, copy toàn bộ kết quả gửi cho trợ lý kỹ thuật của bạn. |

Sau khi setup xong, **khởi động lại Codex**.

## 2. Dùng hằng ngày

Bạn chỉ cần nói chuyện với Codex. Ví dụ:

> "Dùng skill antigravity-orchestration. Trong repo `D:\du-an\shop`, thêm trang Liên hệ có form gửi email. Bạn tự quyết thiết kế, giao Antigravity code, review kỹ rồi tích hợp."

Codex sẽ tự làm vòng lặp:

```text
Codex xem code, ra quyết định, viết Task Contract
  -> start_task        (GravityBridge tạo worktree riêng, Antigravity bắt đầu code ở nền)
  -> await_task ...    (Codex chờ từng đợt ≤ 45 giây, xem tiến độ)
  -> WORKER_COMPLETED  (có bằng chứng: file thay đổi, vi phạm phạm vi, kết quả lint/build do bridge tự chạy)
  -> Codex review diff thật
       ├─ ACCEPT   -> Codex merge vào nhánh chính, kiểm tra lại, commit, dọn worktree
       ├─ REWORK   -> Codex ghi rõ lỗi cần sửa -> continue_task -> Antigravity sửa tiếp
       ├─ REJECT   -> bỏ
       └─ TAKEOVER -> Codex tự làm
```

Lưu ý cho bạn:

1. **Commit trước khi giao việc.** GravityBridge từ chối nếu repo còn thay đổi chưa commit (để Antigravity bắt đầu từ đúng code Codex đã xem).
2. Không tự sửa code trong thư mục worktree (`~/.gravitybridge/worktrees/...`) khi task đang chạy.
3. Nếu Codex hoặc máy bị khởi động lại giữa chừng: chỉ cần bảo Codex *"gọi list_tasks để xem việc dang dở"*. Task đang chạy vẫn tiếp tục ở nền; task bị chết giữa chừng sẽ được đánh dấu `WORKER_FAILED` để Codex quyết định chạy lại hay tự làm.

Gợi ý câu lệnh theo vòng đời dự án: [prompts/12_HUMAN_RUNBOOK.md](./prompts/12_HUMAN_RUNBOOK.md) và [prompts/13_PROMPT_USAGE_ORDER.md](./prompts/13_PROMPT_USAGE_ORDER.md).

## 3. Cơ chế an toàn (vì sao tin được kết quả)

| Rủi ro | Cách GravityBridge xử lý |
|---|---|
| Antigravity sửa file ngoài phạm vi | Hook chặn **trước khi ghi**; sau mỗi lượt còn kiểm tra lại toàn bộ thay đổi. Có vi phạm thì Codex không thể ACCEPT. |
| Antigravity "báo cáo đẹp" nhưng sai | Bridge so sánh danh sách file Antigravity khai với git thật, và **tự chạy lại** lệnh kiểm tra (lint/build/test). |
| File mới bị bỏ sót khi review | Mỗi lượt được chụp thành một commit nên diff luôn có cả file mới/xoá. |
| Antigravity tự commit, đổi nhánh, push | Lệnh git thay đổi lịch sử bị hook chặn; nếu vẫn xảy ra thì bị ghi nhận là vi phạm. |
| Việc dài làm Codex bị timeout | Mọi lệnh trả về trong < 1 phút; Antigravity chạy ở tiến trình nền riêng. |
| Treo mãi ở trạng thái "đang chạy" | Có watchdog + hạn chót; tiến trình chết được phát hiện và đánh dấu. |
| Lặp vô hạn | Giới hạn số lần chạy lại / sửa / hỏi đáp; cùng một lỗi 2 lần liên tiếp thì bắt buộc Codex tự xử lý. |
| Lộ khoá bí mật | Biến môi trường chứa token/khoá (OpenAI, GitHub, cloud…) bị loại bỏ trước khi chạy Antigravity. |
| Mất việc do gọi trùng | Không bao giờ tự xoá worktree/nhánh cũ; trùng `task_id` thì báo lỗi. |

## 4. Gắn repo này vào một dự án (tuỳ chọn)

Tạo bộ "trí nhớ dự án" cho Codex (không ghi đè file đã có):

```powershell
./scripts/bootstrap-target.ps1 -TargetRoot "D:\path\to\project"
```

Tạo `docs/GRAVITYBRIDGE/` gồm PROJECT_PROFILE, CURRENT_STATE, SESSION_HANDOFF, DECISION_LOG, TASK_LEDGER.

## 5. MCP tools (cho Codex)

`start_task`, `await_task`, `continue_task`, `retry_task`, `cancel_task`, `record_review`, `cleanup_task`, `get_task`, `list_tasks`, `get_task_diff`, `get_worker_result`, `get_task_events`, `worker_health`. Chi tiết: [protocol/SPECIFICATION_V1.md](./protocol/SPECIFICATION_V1.md) và [skills/antigravity-orchestration/SKILL.md](./skills/antigravity-orchestration/SKILL.md).

Ví dụ Task Contract: [examples/task.frontend-ui.json](./examples/task.frontend-ui.json).

## 6. Cấu trúc repo

```text
packages/gravitybridge/      MCP server (TypeScript)
  src/index.ts               các MCP tool
  src/jobs.ts                vòng đời task (bất đồng bộ)
  src/runner.ts              tiến trình nền chạy 1 lượt Antigravity + thu bằng chứng
  src/hook.ts                hook PreToolUse chặn phạm vi
  src/install.ts             setup / doctor / smoke
  test/                      kiểm thử tự động với Antigravity giả
antigravity-plugin/codex-worker/agents/   gb-coder, gb-frontend-coder (chỉ code)
skills/antigravity-orchestration/         skill cho Codex
schemas/                     JSON Schema (sinh tự động từ src/types.ts)
protocol/  prompts/  FRAMEWORK.md         quy trình và tài liệu
scripts/                     setup / doctor / smoke / bootstrap-target
docs/IMPROVEMENT_PLAN.md     phương án cải tiến V1.1
```

## 7. Cho người phát triển repo

```bash
cd packages/gravitybridge
npm ci && npm run typecheck && npm run build && npm test
npm run gen:schemas   # sau khi sửa src/types.ts
```

Biến môi trường: `GRAVITYBRIDGE_HOME` (thư mục trạng thái, mặc định `~/.gravitybridge`), `GRAVITYBRIDGE_AGY` (đường dẫn đầy đủ tới `agy` nếu không có trong PATH), `GRAVITYBRIDGE_MAX_PARALLEL` (mặc định 2), `GRAVITYBRIDGE_ENV_KEEP` (danh sách biến môi trường cần giữ lại cho worker).

Không bật `--dangerously-skip-permissions`. Không cấp quyền merge/push cho Antigravity.
