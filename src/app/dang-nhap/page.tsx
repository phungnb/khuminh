import Link from "next/link";
import SubmitButton from "@/components/submit-button";
import { LegalFooter } from "@/components/legal-note";
import { AuthShell, Flash } from "@/components/ui";
import { supportContact } from "@/lib/support";
import { loginAction } from "../auth-actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Đăng nhập" subtitle="Chợ tiện ích quanh nhà. Người thuê đăng nhập bằng số điện thoại, chủ trọ bằng email.">
      <Flash params={sp} />
      <form action={loginAction} className="card space-y-3">
        <div>
          <label className="label" htmlFor="email">Email hoặc số điện thoại</label>
          <input className="input" id="email" name="email" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Mật khẩu</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn w-full">Đăng nhập</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm">
        Chưa có tài khoản? <Link className="font-semibold text-brand-ink" href="/dang-ky">Đăng ký miễn phí</Link>
      </p>
      <p className="mt-2 text-center text-xs text-fg-subtle">
        Quên mật khẩu? Người thuê: xin chủ nhà gửi link đặt lại. Chủ trọ: liên hệ hỗ trợ.
      </p>
      <LegalFooter support={supportContact()} />
    </AuthShell>
  );
}
