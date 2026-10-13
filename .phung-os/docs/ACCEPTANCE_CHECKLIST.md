# Checklist nghiệm thu v1 (tích khi có bằng chứng thật)
## A. Não & kiến trúc
- [ ] Repo phung-os có tag; mỗi dự án ghi PHUNG_OS_VERSION và CI kiểm khớp.
- [ ] Git giữ kỹ thuật, Drive giữ kinh doanh; chỉ trỏ link.
- [ ] CLAUDE.md gốc @-import .phung-os/CLAUDE.md; skills ở .claude/skills gốc (được nạp thật).
- [ ] Não chung trung lập stack; Supabase là module tùy chọn.
## B. Kế hoạch
- [ ] Yêu cầu có ID + truy nguồn; có câu hỏi/mâu thuẫn/giả định.
- [ ] DAG hợp lệ; mỗi task có nghiệm thu, test, nhãn rủi ro.
## C. Tự động hóa & an toàn
- [ ] Không sửa code trước duyệt; sau duyệt LOW/MEDIUM tự chạy, HIGH dừng xin phép.
- [ ] Không lộ secret; không tự deploy/không lệnh phá hủy.
## D. Chất lượng liên tục
- [ ] Mỗi task qua code-review + security + nghiệm thu rồi mới XONG.
- [ ] CI chạy song song: build/test | code-quality | security (gitleaks+secscan nếu Supabase) |
      version-check. Đỏ không merge.
- [ ] Có evidence mỗi task; có DELTA; chỉ cập nhật brain sau kiểm chứng.
