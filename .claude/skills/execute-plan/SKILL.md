---
name: execute-plan
description: Thực thi kế hoạch ĐÃ DUYỆT; tự chạy LOW/MEDIUM tuần tự theo DAG; mỗi task qua review+security+nghiệm thu; dừng xin phép ở HIGH.
---
# execute-plan
Theo docs/EXECUTION_PROMPT.md. Yêu cầu có câu APPROVED. Với mỗi task: thực thi → chạy code-review
+ security-review + nghiệm thu; XONG chỉ khi cả ba PASS; ghi evidence; HIGH thì dừng xin phép.
