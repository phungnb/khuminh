# Điều phối: đặc tả → tự thực thi (sau duyệt), chất lượng chạy liên tục

## Pha 1 — Coordinator (lập kế hoạch). Dừng chờ duyệt.
Theo docs/COORDINATOR_PROMPT.md. Sinh trong work/<FEATURE-ID>/: FEATURE_BRIEF, OPEN_QUESTIONS,
DESIGN, TASKS (DAG, mỗi task nhãn LOW/MEDIUM/HIGH), TEST_PLAN, APPROVAL_SUMMARY. Kết thúc: trình
APPROVAL_SUMMARY, DỪNG.

## Cổng duyệt
`APPROVED: <FEATURE-ID> plan v<x.y>`. Đổi lớn sau duyệt → quay lại pha 1.

## Pha 2 — Executor (tự thực thi, TUẦN TỰ ở v1)
Theo docs/EXECUTION_PROMPT.md. Vòng lặp cho tới hết task:
1. Lấy task đã đủ phụ thuộc (theo DAG, tuần tự).
2. HIGH → DỪNG xin phê duyệt riêng (cổng an toàn). Không tự chạy.
3. LOW/MEDIUM → thực thi trong phạm vi task.
4. NGAY sau khi code: chạy BA kiểm tra song song — code-review, security-review, nghiệm thu
   (TEST_PLAN của task). Chỉ XONG khi cả ba PASS. FAIL → sửa gốc, không bỏ qua.
5. Ghi evidence/ (log test, diff, kết quả review/bảo mật). Báo PASS/FAIL/NOT RUN.
6. Mỗi task = một commit/nhánh review được.
Hết task → release-gate (CI xanh: build/test + review + security + version-check) → DELTA.

## Chống hỏng khi tự chạy
Không hai luồng cùng sửa một module; không tự mở rộng phạm vi (phát sinh → OPEN_QUESTIONS);
không vượt cổng an toàn; v1 tuần tự để tránh xung đột.
