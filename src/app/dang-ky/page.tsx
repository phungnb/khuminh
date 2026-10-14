import Link from "next/link";
import { AuthShell, Flash } from "@/components/ui";
import { signupAction } from "../auth-actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Tạo tài khoản chủ trọ" subtitle="Chủ trọ, chung cư mini: quản lý phòng, hóa đơn miễn phí và mở chợ cho cư dân.">
      <Flash params={sp} />
      <form action={signupAction} className="card space-y-3">
        <div>
          <label className="label" htmlFor="displayName">Tên của bạn</label>
          <input className="input" id="displayName" name="displayName" required />
        </div>
        <div>
          <label className="label" htmlFor="orgName">Tên khu trọ / đơn vị</label>
          <input className="input" id="orgName" name="orgName" placeholder="Nhà trọ Cô Hoa" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Mật khẩu (ít nhất 8 ký tự)</label>
          <input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
        </div>
        <button className="btn w-full">Đăng ký</button>
      </form>
      <p className="mt-4 text-center text-sm">
        Đã có tài khoản? <Link className="font-semibold text-brand-ink" href="/dang-nhap">Đăng nhập</Link>
      </p>
    </AuthShell>
  );
}
