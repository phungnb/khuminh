import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, EmptyState, Flash } from "@/components/ui";
import { LinkIcon } from "lucide-react";
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
      <AuthShell>
        <EmptyState
          icon={LinkIcon}
          title="Link mời không còn hiệu lực"
          description="Link đã hết hạn hoặc đã được dùng. Nếu bạn đã có tài khoản, hãy đăng nhập."
          action={<Link className="btn" href="/dang-nhap">Đăng nhập</Link>}
        />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Bạn được mời"
      subtitle={
        <>
          Chào {invite.fullName}. Chủ nhà {invite.propertyName} mời bạn vào app để xem hóa đơn phòng {invite.unitCode} và chuyển khoản bằng mã QR.
        </>
      }
    >
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
    </AuthShell>
  );
}
