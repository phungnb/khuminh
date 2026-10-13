import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/ui";
import { resolveStaffInvite } from "@/server/staff";
import { acceptStaffInviteAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lời mời quản lý — KhuMình", robots: { index: false, follow: false } };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { token } = await params;
  const invite = await resolveStaffInvite(token);
  if (!invite) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12 text-center">
        <h1 className="text-lg font-bold">Link mời không còn hiệu lực</h1>
        <p className="mt-2 text-sm text-stone-600">Link đã hết hạn hoặc đã được dùng. Hãy xin chủ trọ link mới.</p>
        <Link className="btn mt-4 inline-block" href="/dang-nhap">Đăng nhập</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-brand">KhuMình</h1>
      <p className="mb-6 text-sm text-stone-600">
        {invite.orgName} mời bạn cùng quản lý <b>{invite.propertyName}</b>: ghi chỉ số, thu tiền, đăng thông báo.
      </p>
      <Flash params={await searchParams} />
      <form action={acceptStaffInviteAction} className="card space-y-3">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="displayName">Tên của bạn</label>
          <input className="input" id="displayName" name="displayName" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Mật khẩu (ít nhất 8 ký tự)</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <p className="text-xs text-stone-500">Đã có tài khoản KhuMình với email này thì nhập mật khẩu cũ, không cần tên.</p>
        <button className="btn w-full">Nhận lời mời</button>
      </form>
    </main>
  );
}
