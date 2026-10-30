import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { supportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Điều khoản sử dụng — KhuMình" };

export default function Page() {
  const support = supportContact();
  return (
    <main className="prose-sm mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="inline-block"><Logo /></Link>
      <h1 className="text-2xl font-bold">Điều khoản sử dụng</h1>
      <p className="text-fg-subtle">Cập nhật ngày 30/10/2026.</p>

      <h2 className="font-semibold">1. KhuMình làm gì</h2>
      <p>
        KhuMình giúp chủ trọ quản lý phòng, chỉ số điện nước, hóa đơn và công nợ; giúp người thuê xem hóa đơn của mình;
        và cho người dùng đăng tin mua bán, cho tặng, dịch vụ quanh khu.
      </p>

      <h2 className="font-semibold">2. Tiền và hóa đơn</h2>
      <p>
        KhuMình không giữ tiền và không xử lý thanh toán. Mã QR trên hóa đơn chuyển tiền thẳng vào tài khoản ngân hàng do
        chủ trọ khai báo. Hóa đơn chỉ được coi là đã thanh toán khi chủ trọ ghi nhận. Chủ trọ chịu trách nhiệm về biểu phí,
        chỉ số và số tiền trên hóa đơn mình phát hành.
      </p>

      <h2 className="font-semibold">3. Tài khoản</h2>
      <p>
        Bạn giữ bí mật mật khẩu của mình. Người thuê quên mật khẩu có thể xin chủ trọ link đặt lại. Không dùng tài khoản của
        người khác.
      </p>

      <h2 className="font-semibold">4. Tin đăng ở chợ</h2>
      <p>
        Người đăng chịu trách nhiệm về nội dung và giao dịch của mình. Không đăng hàng cấm, hàng giả, nội dung lừa đảo hoặc
        xúc phạm. Tin bị nhiều người báo cáo sẽ tự ẩn. KhuMình không đứng giữa giao dịch giữa người mua và người bán.
      </p>

      <h2 className="font-semibold">5. Thay đổi và chấm dứt</h2>
      <p>
        Dịch vụ đang thử nghiệm và có thể thay đổi. Tài khoản vi phạm điều khoản có thể bị khóa.
      </p>

      <h2 className="font-semibold">6. Liên hệ</h2>
      <p>{support ? `Hỗ trợ: ${support}.` : "Liên hệ qua chủ trọ của bạn."} Xem thêm <Link className="underline" href="/rieng-tu">Chính sách riêng tư</Link>.</p>
    </main>
  );
}
