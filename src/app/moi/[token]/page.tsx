import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/ui";
import { resolveTenantInvite } from "@/server/tenant";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lời mời vào KhuMình", robots: { index: false, follow: false } };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { token } = await params;
  const invite = await resolveTenantInvite(token);
  if (!invite) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12 text-center">
        <h1 className="text-lg font-bold">Link mời không còn hiệu lực</h1>
        <p className="mt-2 text-sm text-fg-muted">Link đã hết hạn hoặc đã được dùng. Nếu bạn đã có tài khoản, hãy đăng nhập.</p>
        <Link className="btn mt-4 inline-block" href="/dang-nhap">Đăng nhập</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-brand-ink">KhuMình</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Chào {invite.fullName}. Chủ nhà {invite.propertyName} mời bạn vào app để xem hóa đơn phòng {invite.unitCode} và chuyển khoản bằng mã QR.
      </p>
      <Flash params={await searchParams} />
      <form action={acceptInviteAction} className="card space-y-3">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="phone">Số điện thoại</label>
          <input className="input" id="phone" name="phone" inputMode="tel" autoComplete="tel" defaultValue={invite.phone ?? ""} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Mật khẩu (ít nhất 6 ký tự)</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={6} required />
        </div>
        <p className="text-xs text-fg-subtle">Nếu số này đã có tài khoản KhuMình, nhập mật khẩu cũ để thêm phòng này vào tài khoản.</p>
        <button className="btn w-full">Vào app</button>
      </form>
    </main>
  );
}
