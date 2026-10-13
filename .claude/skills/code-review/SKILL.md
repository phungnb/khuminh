---
name: code-review
description: Rà diff của một task/PR tìm lỗi đúng-sai, biên/lỗi, nợ kỹ thuật, lệch tiêu chí nghiệm thu. Chạy sau MỖI task, không chỉ cuối.
---
# code-review
Rà git diff của task: đúng logic, xử lý biên/lỗi/rỗng, idempotency, hợp đồng API, đối chiếu tiêu
chí nghiệm thu trong TASKS.md. Trả phát hiện xếp theo mức nghiêm trọng; chặn "XONG" nếu có lỗi thật.
