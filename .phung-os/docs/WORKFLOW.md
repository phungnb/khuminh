# Luồng đặc tả → nghiệm thu
1. Intake (dự án, repo, đặc tả chuẩn).
2. Phân tích & phản biện (Coordinator).
3. Task graph DAG (nhãn rủi ro, cờ duyệt).
4. DUYỆT phương án (theo phiên bản).
5. Tự thực thi tuần tự (Executor); HIGH dừng xin phép.
6. Chất lượng liên tục mỗi task: code-review + security + nghiệm thu; CI chạy song song mỗi push.
7. Release-gate rồi Knowledge DELTA (Git brain; Drive STATUS nếu là quyết định kinh doanh).
