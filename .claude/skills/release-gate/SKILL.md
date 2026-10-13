---
name: release-gate
description: Cổng trước khi coi tính năng hoàn tất — tổng hợp CI (build/test), code-review, security, nghiệm thu, version-check thành PASS/FAIL/NOT RUN.
---
# release-gate
1. CI xanh: build/test, code-quality, security (gitleaks + secscan nếu Supabase), version-check.
2. Đối chiếu TEST_PLAN: mỗi tiêu chí → PASS/FAIL/NOT RUN kèm bằng chứng.
3. Không còn cổng an toàn nào bị vượt mà chưa duyệt.
Kết luận đủ điều kiện release hay không. Không tự deploy production.
