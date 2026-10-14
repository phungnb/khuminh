import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, EmptyState, Flash } from "@/components/ui";
import { LinkIcon } from "lucide-react";
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
      <AuthShell>
        <EmptyState
          icon={LinkIcon}
          title="Link mời không còn hiệu lực"
          description="Link đã hết hạn hoặc đã được dùng. Hãy xin chủ trọ link mới."
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
          {invite.orgName} mời bạn cùng quản lý <b>{invite.propertyName}</b>: ghi chỉ số, thu tiền, đăng thông báo.
        </>
      }
    >
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
        <p className="text-xs text-fg-subtle">Đã có tài khoản KhuMình với email này thì nhập mật khẩu cũ, không cần tên.</p>
        <button className="btn w-full">Nhận lời mời</button>
      </form>
    </AuthShell>
  );
}
