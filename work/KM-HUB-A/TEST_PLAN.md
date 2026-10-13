# TEST_PLAN — KM-HUB-A

1. `npm run lint`, `npm test`, `npm run test:db`, `check:rls` phải PASS. Diff không chạm src/domain, src/server và drizzle/, nên không có test tiền nào được phép đổi.
2. Chạy app với Postgres thử nghiệm, có seed 1 chủ trọ, 1 nhân viên và 1 người thuê có hóa đơn. Chụp màn hình bằng Playwright ở bề rộng điện thoại 390px và desktop:
   - Chưa đăng nhập, mở `/`: thấy landing, không thấy dữ liệu nào.
   - Người thuê: vào `/app` thấy thẻ khu, bảng tin, số cần trả đúng bằng tổng ở `/app/hoa-don`. Không thấy tab Quản lý. Gõ thẳng `/quan-ly` bị chuyển về `/app`.
   - Chủ trọ: vào `/app` thấy thẻ Quản lý khu. Bấm vào thì tới `/quan-ly` rồi `/co-so/<id>`, module chạy như cũ.
   - Nhân viên: chỉ thấy cơ sở được giao.
3. Kiểm tra diff bằng `git diff --stat main` để chắc không có file nào trong src/domain, src/server, drizzle/ hay src/db.
