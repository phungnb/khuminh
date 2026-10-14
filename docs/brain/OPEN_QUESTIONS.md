# OPEN_QUESTIONS — KhuMình
câu hỏi | P | vì sao | khuyến nghị | ai duyệt
KhuMình đang ở giai đoạn nào (thử nghiệm/đã có khách)? | P1 | quyết mức đầu tư tiếp | — | anh
Có tạo Project Drive 07_KHUMINH + STATUS như các dự án khác không? | P2 | đồng bộ PHUNG OS | nên | anh
RLS đã phủ 100% bảng chưa? | P0 | dữ liệu tiền trọ | để CI check-rls xác nhận | anh
Mở đăng ký công khai bằng SĐT (giai đoạn 2) khi nào? | P1 | chợ chỉ sống được khi có người ngoài khu trọ | khi đạt: ≥40% người thuê đăng nhập, ≥1 tin/khu/tuần, ≥20% tin có quan tâm trong 4 tuần | anh
Chống spam/lừa đảo ngoài báo cáo (giới hạn số tin/ngày, xác thực SĐT bằng OTP)? | P1 | chưa có giới hạn tần suất đăng tin | thêm giới hạn 10 tin/ngày ở giai đoạn 2 | anh
Ảnh tin đăng? | P2 | cần kho lưu file (chi phí hạ tầng) | Vercel Blob khi có nhu cầu | anh
Vercel Preview dùng chung DATABASE_URL với Production không? | P0 | vercel-build chạy migration: push nhánh có migration có thể migrate DB thật trước khi duyệt | tách DB Preview hoặc tắt setup-db khi VERCEL_ENV=preview | anh
Nhà cung cấp Postgres production, sao lưu bật chưa, đã thử khôi phục chưa? | P0 | dữ liệu tiền trọ | ghi vào docs/brain/VAN_HANH.md | anh
Giới hạn đăng nhập sai (KM-VH T4): bảng login_attempts, khóa 15 phút sau 5 lần sai theo SĐT/email | P1 | mật khẩu người thuê cũ có thể chỉ 6 ký tự | làm sau khi trả lời câu Preview | anh
Kênh hỗ trợ (Zalo/SĐT) đặt vào NEXT_PUBLIC_SUPPORT_CONTACT? Nội dung /dieu-khoan, /rieng-tu duyệt chưa? | P1 | NĐ 13/2023 về dữ liệu cá nhân [kiến thức chung] | anh duyệt bản nháp | anh
