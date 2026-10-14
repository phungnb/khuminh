import Link from "next/link";
import { Flash, Logo } from "@/components/ui";
import { loginAction } from "../auth-actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <Link href="/" className="mb-6 inline-block"><Logo /></Link>
      <h1 className="mb-1 text-2xl font-bold">Đăng nhập</h1>
      <p className="mb-6 text-sm text-fg-muted">Chợ tiện ích quanh nhà. Người thuê đăng nhập bằng số điện thoại, chủ trọ bằng email</p>
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
        <button className="btn w-full">Đăng nhập</button>
      </form>
      <p className="mt-4 text-center text-sm">
        Chưa có tài khoản? <Link className="font-semibold text-brand-ink" href="/dang-ky">Đăng ký miễn phí</Link>
      </p>
    </main>
  );
}
