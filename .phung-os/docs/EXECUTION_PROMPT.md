# Execution Prompt — tự thực thi SAU khi duyệt
Yêu cầu: có `APPROVED: <FEATURE-ID> plan v<x.y>`. Chạy TUẦN TỰ theo DAG (v1).
Mỗi task:
- HIGH (chạm cổng an toàn CLAUDE.md mục 4) → DỪNG, trình kế hoạch con + diff dự kiến, xin duyệt
  riêng. Không tự chạy.
- LOW/MEDIUM → thực thi đúng phạm vi; rồi NGAY lập tức chạy ba kiểm tra: code-review +
  security-review + nghiệm thu (TEST_PLAN). XONG chỉ khi cả ba PASS.
- Ghi evidence/; báo PASS/FAIL/NOT RUN; FAIL → sửa gốc, không sửa test cho qua, không đánh dấu
  hoàn thành.
- Mỗi task một commit/nhánh. Không gộp khó đọc, không tự mở rộng phạm vi.
Hết task → release-gate → knowledge-delta.
Tuyệt đối không: vượt cổng an toàn, commit secret, làm yếu test/bảo mật, nói đã test khi chưa chạy.
