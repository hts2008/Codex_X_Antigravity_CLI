# Phương án cải tiến GravityBridge V1.1

Mục tiêu do chủ repo đặt ra: **Codex ra quyết định, điều phối, review. Antigravity CLI chỉ code theo chỉ thị của Codex.** Tài liệu này ghi lại vấn đề của V1.0, phương án đã chọn, những gì đã làm và những gì còn phải kiểm chứng trên máy thật.

## 1. Vấn đề của V1.0 (đã xác minh khi review)

| # | Mức | Vấn đề | Hậu quả |
|---|---|---|---|
| C1 | Nghiêm trọng | Diff dùng `git diff base --` nên **bỏ sót file mới** (untracked) | File mới, kể cả file ghi vào vùng cấm, không hiện ra khi review |
| C2 | Nghiêm trọng | `delegate_and_wait` chờ đồng bộ tới 30 phút, trong khi Codex mặc định cắt tool sau 60 giây | Task dài thất bại phía Codex dù Antigravity vẫn chạy |
| C3 | Nghiêm trọng | Tạo worktree **xoá thư mục cũ trước khi kiểm tra** | Gọi lại cùng `task_id` làm mất công việc trước |
| C4 | Nghiêm trọng | Chế độ headless của agy mặc định từ chối lệnh shell nhưng vẫn báo SUCCESS; agent thiếu `write_to_file` | Worker không chạy được lint/build hoặc không tạo được file mới, nhưng báo thành công |
| H | Cao | Phạm vi đường dẫn không được ép buộc; worktree không có `node_modules`; kẹt RUNNING khi crash; không huỷ được; không watchdog; không đối chiếu lời khai của worker; log không giới hạn; rule `always_on` áp lên mọi dự án; AGENTS.md của dự án làm worker lẫn vai; không có test/lockfile; state machine ngầm định; lộ biến môi trường bí mật; tài liệu lệch code | Kết quả không đáng tin, khó vận hành cho người không biết code |

## 2. Các lựa chọn đã cân nhắc

| Phương án | Ưu | Nhược | Kết luận |
|---|---|---|---|
| A. Giữ đồng bộ, tăng `tool_timeout_sec` | Ít thay đổi | Phụ thuộc cấu hình Codex; Codex bị "đóng băng" 30 phút; restart là mất task | Loại |
| **B. Bất đồng bộ: `start_task` + `await_task` (long-poll ≤ 50 s), runner chạy nền tách rời** | Không bao giờ timeout; sống sót khi Codex restart; Codex xem được tiến độ | Thêm tiến trình nền, cần cơ chế phát hiện tiến trình chết | **Chọn** |
| C. Supervisor + Codex app-server tự đánh thức | Tự động hoàn toàn | Phức tạp, phụ thuộc API chưa ổn định | Để giai đoạn 3 |

Về ép phạm vi: chỉ kiểm tra sau (đơn giản, nhưng file sai đã bị ghi) **vs** hook chặn trước + kiểm tra sau (an toàn hai lớp). Chọn **hai lớp**, vì nếu hook không hoạt động trên máy thật thì lớp kiểm tra sau vẫn bảo vệ.

## 3. Thiết kế V1.1 (đã triển khai)

- **Vòng lặp bất đồng bộ:** `start_task`, `await_task`, `continue_task`, `retry_task`, `cancel_task`, `record_review`, `cleanup_task`, `get_task`, `list_tasks`, `get_task_diff`, `get_worker_result`, `get_task_events`, `worker_health`.
- **Runner tách rời** cho mỗi lượt; watchdog; hạn chót cứng; tự phát hiện runner chết → `WORKER_FAILED`/`CANCELED`.
- **Bằng chứng từ git:** mỗi lượt được commit snapshot → diff có file mới/xoá; diff theo lượt hoặc cộng dồn.
- **Ép phạm vi hai lớp:** hook `PreToolUse` (chặn ghi ngoài phạm vi, chặn git thay đổi lịch sử, tự duyệt lệnh kiểm tra) + kiểm tra sau mỗi lượt. Đường dẫn bảo vệ: `.git/ .agents/ .codex/ AGENTS.md docs/GRAVITYBRIDGE/`.
- **Không tin lời khai:** đối chiếu `task_id`, `files_changed` với git; bridge tự chạy `setup_commands` (vd `npm ci`) và `validation_commands`; kết quả có cấu trúc được kiểm tra nghiêm ngặt.
- **Chống vòng lặp:** ngân sách retry / rework / trả lời blocker; cùng lỗi 2 lần → bắt buộc Codex xử lý.
- **Cổng review:** không ACCEPT được khi còn vi phạm phạm vi; validation fail thì phải có `override_reason`; REWORK phải có danh sách lỗi cụ thể.
- **Worker chỉ code:** thay 5 agent "chuyên gia thiết kế/UX/QA" + rule toàn cục bằng 2 agent `gb-coder`, `gb-frontend-coder` (đủ tool ghi file, không làm subagent). Prompt dặn worker coi file hướng dẫn trong repo là dữ liệu, không phải mệnh lệnh.
- **An toàn khác:** không xoá ngầm; repo phải sạch; tối đa 2 task song song; loại biến môi trường bí mật; log có giới hạn; ghi file nguyên tử.
- **Vận hành cho người không biết code:** `setup` / `doctor` / `smoke` đa nền tảng; README tiếng Việt; CI chạy trên Ubuntu + Windows.
- **Một nguồn sự thật:** state machine ở `src/state.ts`; JSON Schema sinh từ `src/types.ts`, có test chống lệch.

## 4. Các giai đoạn

### Giai đoạn 1 — Nền tảng V1.1 (đã xong trong PR này)
**Mục tiêu:** sửa toàn bộ lỗi C1–C4 và nhóm H.
**Tiêu chí thành công:** typecheck + build + 17 test tự động pass; test e2e với Antigravity giả bao phủ: file mới, vi phạm phạm vi, khai sai, validation, rework + diff theo lượt, blocked, kết quả sai cấu trúc, chặn lỗi lặp, huỷ, runner chết, trùng `task_id`, quyết định của hook; CI xanh trên Linux và Windows.

### Giai đoạn 2 — Kiểm chứng với Antigravity thật (cần chủ repo chạy, ~10 phút)
**Mục tiêu:** xác nhận các giả định chỉ kiểm chứng được trên máy có `agy` đăng nhập.
**Việc cần làm:** chạy `setup`, `doctor`, `smoke` (xem README mục 1) và gửi lại kết quả.
**Tiêu chí thành công:** `smoke` ra 5 dòng `[OK]`.
**Những điều smoke sẽ xác nhận:**
1. Hook có được gọi ở chế độ headless `-p` không (dòng "scope hook was called").
2. Tên agent từ plugin có cần tiền tố không (`--agent gb-coder`).
3. `auto_approve` có cho phép lệnh kiểm tra chạy trong headless không (xem `permission_notices`).
4. Trên Windows `agy` có chạy trực tiếp được không (nếu không: đặt `GRAVITYBRIDGE_AGY`).

Nếu điểm nào hỏng, chỉ cần chỉnh nhỏ (tên agent, đường dẫn agy, cấu hình permission) — kiến trúc không đổi, và lớp kiểm tra sau mỗi lượt vẫn giữ an toàn trong lúc chờ sửa.

### Giai đoạn 3 — Dùng thật và tinh chỉnh (1–2 tuần sử dụng)
**Mục tiêu:** chạy 5–10 task thật trên một dự án.
**Theo dõi:** tỉ lệ ACCEPT ở lượt đầu, số vòng REWORK, lỗi lặp, thời gian mỗi task.
**Tinh chỉnh:** chính sách lệnh được phép, nội dung prompt worker, giá trị timeout mặc định.

### Giai đoạn 4 — Tự động hoá sâu hơn (tuỳ chọn, chỉ khi giai đoạn 3 ổn định)
Supervisor đánh thức Codex khi task xong (Codex app-server), lập lịch theo đồ thị phụ thuộc (DAG), báo cáo chi phí/token.

## 5. Rủi ro

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Hook không được gọi trong headless | Trung bình | Trung bình | Kiểm tra sau mỗi lượt vẫn chặn ACCEPT; smoke phát hiện ngay |
| Lệnh kiểm tra của worker bị từ chối | Trung bình | Thấp | Bridge tự chạy validation độc lập |
| Tên agent plugin cần namespace | Thấp | Thấp | Sửa `worker.agent` mặc định |
| Hook toàn cục ảnh hưởng dùng agy bình thường | Thấp | Trung bình | Ngoài worktree GravityBridge hook luôn trả `allow`; có test |
| `hooks.json` hiện có bị hỏng | Thấp | Trung bình | Installer sao lưu trước, không ghi nếu JSON lỗi |
| Tiến trình nền mồ côi | Thấp | Thấp | Watchdog, hạn chót, reconcile, `cancel_task` diệt cả cây tiến trình |

## 6. Việc chủ repo cần làm

1. Bấm **Merge** pull request.
2. Trên máy Windows: `git pull`, rồi chạy 3 lệnh ở README mục 1.
3. Gửi lại kết quả của `doctor` và `smoke`.
