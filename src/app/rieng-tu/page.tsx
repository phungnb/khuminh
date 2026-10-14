import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { supportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Chính sách riêng tư — KhuMình" };

// BẢN NHÁP: nội dung cần chủ dự án duyệt trước khi coi là chính thức. Mô tả đúng những gì code đang lưu.
export default function Page() {
  const support = supportContact();
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="inline-block"><Logo /></Link>
      <h1 className="text-2xl font-bold">Chính sách riêng tư</h1>
      <p className="text-fg-subtle">Bản nháp ngày 14/10/2026.</p>

      <h2 className="font-semibold">1. Dữ liệu chúng tôi lưu</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Tài khoản: tên hiển thị, email (chủ trọ) hoặc số điện thoại (người thuê), mật khẩu dạng đã băm (không ai đọc được mật khẩu gốc).</li>
        <li>Do chủ trọ nhập: họ tên, số điện thoại người thuê, phòng, hợp đồng, tiền cọc, chỉ số điện nước, hóa đơn, thanh toán.</li>
        <li>Chợ: tin đăng, liên hệ bạn tự nhập, vị trí của khu trọ đã làm tròn khoảng 500 m. Không lấy GPS điện thoại.</li>
        <li>Thông báo đẩy: địa chỉ nhận thông báo của trình duyệt, nếu bạn bật.</li>
        <li>Nhật ký thao tác liên quan tới tiền (lập, sửa, hủy hóa đơn và thanh toán) để đối soát.</li>
      </ul>

      <h2 className="font-semibold">2. Ai xem được</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Người thuê chỉ xem hóa đơn của chính mình.</li>
        <li>Chủ trọ và nhân viên được giao chỉ xem dữ liệu khu của họ. Dữ liệu giữa các chủ trọ được tách riêng ở tầng cơ sở dữ liệu.</li>
        <li>Số điện thoại ở chợ chỉ hiện cho người kia khi người đăng tin đồng ý.</li>
        <li>Chúng tôi không bán dữ liệu cho bên thứ ba.</li>
      </ul>

      <h2 className="font-semibold">3. Mục đích</h2>
      <p>Chỉ để vận hành các chức năng trên: lập và gửi hóa đơn, cho người thuê xem hóa đơn, kết nối người mua bán trong khu.</p>

      <h2 className="font-semibold">4. Quyền của bạn</h2>
      <p>
        Bạn có thể yêu cầu xem, sửa hoặc xóa dữ liệu của mình, hoặc rút lại đồng ý.
        {support ? ` Gửi yêu cầu tới ${support}.` : " Gửi yêu cầu qua chủ trọ của bạn."} Riêng hóa đơn và thanh toán, chủ trọ có thể cần giữ lại để đối chiếu công nợ.
      </p>

      <p>Xem thêm <Link className="underline" href="/dieu-khoan">Điều khoản sử dụng</Link>.</p>
    </main>
  );
}
