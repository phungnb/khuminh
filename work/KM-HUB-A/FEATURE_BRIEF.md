# FEATURE_BRIEF — KM-HUB-A: đổi trục KhuMình sang nền tảng cư dân (tầng giao diện)

- Căn cứ: khuminh/doi-chieu-dac-ta.md; đặc tả gốc khuminh/dac-ta-goc/ (docx = nền tảng, PRD = module quản lý trọ); anh chọn "A rồi B" ngày 2026-10-13 (CONFIRMED).
- Vấn đề (CONFIRMED, src/app/page.tsx): đăng nhập là vào thẳng quản lý cơ sở; người thuê bị đẩy sang /app chỉ có hóa đơn + bảng tin. Sản phẩm trông như app quản lý trọ.
- Mục tiêu: mở web lên thấy KhuMình là tiện ích khu dân cư; quản lý trọ là một mục "Quản lý khu", giống mục quản lý CLB trong RaceHub.

## Phạm vi
1. Trang `/` công khai giới thiệu KhuMình là tiện ích khu dân cư. Có hai lối vào: "Vào khu của tôi" (đăng nhập) và "Chủ trọ: quản lý khu miễn phí" (đăng ký).
2. Sau đăng nhập, mọi người vào hub cư dân `/app`. Hub có thẻ khu của tôi theo kiểu "tường CLB", bảng tin mới nhất, việc cần trả nếu đang thuê và lối vào "Quản lý khu" nếu là chủ trọ hoặc nhân viên.
3. Trang `/quan-ly` liệt kê các cơ sở anh quản lý dưới dạng thẻ CLB và có nút tạo cơ sở. Module dùng lại nguyên các route `/co-so/*`.
4. Đổi thanh điều hướng: hub có các tab Trang chủ, Bảng tin, Hóa đơn, và Quản lý (chỉ hiện với người quản lý). Trong module có nút "Về khu của tôi".
5. Đổi chữ và metadata từ "Quản lý nhà trọ" sang "Tiện ích khu dân cư". Sửa README, CURRENT_STATE và DECISION_LOG.

## Non-goals (để dành cho B, hoặc không làm)
- Cư dân tự đăng ký không cần link mời (đụng xác thực, cổng HIGH).
- Thực thể "khu dân cư" độc lập, bảng tin theo khu thay vì theo cơ sở (migration và RLS, cổng HIGH).
- Chợ, dịch vụ, ví, escrow.
- Mọi thay đổi ở src/domain, billing, payments, RLS, migration, auth.
- Đổi tên route `/co-so/*` sang `/quan-ly/*`. Giữ nguyên để không làm gãy link đã gửi và các redirect trong actions.
