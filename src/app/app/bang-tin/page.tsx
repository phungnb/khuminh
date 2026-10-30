import { Megaphone, Plus } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import Link from "next/link";
import { PostList } from "@/components/post-list";
import { EmptyState, Flash } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { listPosts, tenantBoardViewer } from "@/server/board";
import { tenantHome } from "@/server/tenant";
import { tenantClosePostAction, tenantCreatePostAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string; cs?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  // Mỗi khu trọ đang ở một bảng tin; nhiều phòng cùng khu dùng chung.
  const places = [
    ...new Map(
      (await tenantHome(user.id)).filter((h) => h.active).map((h) => [`${h.orgId}.${h.propertyId}`, h.propertyName]),
    ),
  ];
  if (places.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Bảng tin của khu"
        description="Bảng tin chỉ dành cho người đang ở trong khu trọ. Nhờ chủ trọ gửi link mời để tham gia."
        action={<Link className="btn-secondary" href="/app">Về chợ</Link>}
      />
    );
  }
  const cs = places.some(([k]) => k === sp.cs) ? sp.cs! : places[0]![0];
  const [orgId, propertyId] = cs.split(".") as [string, string];
  const posts = await listPosts(await tenantBoardViewer(user.id, orgId, propertyId));
  const hidden = <input type="hidden" name="cs" value={cs} />;

  return (
    <>
      {places.length > 1 ? (
        <div className="scrollbar-none -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {places.map(([k, name]) => (
            <Link key={k} href={`/app/bang-tin?cs=${k}`} className={k === cs ? "chip chip-on" : "chip"}>
              {name}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mb-3 flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
          <Megaphone className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">Bảng tin {places.find(([k]) => k === cs)![1]}</h1>
          <p className="text-xs text-fg-subtle">Chỉ người trong khu và chủ trọ thấy</p>
        </div>
      </div>
      <Flash params={sp} />
      <details className="card mb-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
          <Plus className="size-4" />
          Đăng tin trong khu
        </summary>
        <form action={tenantCreatePostAction} className="mt-3 space-y-3">
          {hidden}
          <div>
            <label className="label" htmlFor="kind">Loại tin</label>
            <select className="input" id="kind" name="kind" defaultValue="sell">
              <option value="sell">Cần bán</option>
              <option value="give">Cho tặng</option>
              <option value="want">Cần tìm</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">Tiêu đề</label>
            <input className="input" id="title" name="title" maxLength={120} placeholder="Bán quạt đứng còn mới" required />
          </div>
          <div>
            <label className="label" htmlFor="price">Giá (nếu bán)</label>
            <input className="input" id="price" name="price" inputMode="numeric" placeholder="150.000" />
          </div>
          <div>
            <label className="label" htmlFor="body">Mô tả, cách liên hệ</label>
            <textarea className="input" id="body" name="body" rows={3} maxLength={2000} placeholder="Phòng 101, nhắn Zalo 09xx..." />
          </div>
          <p className="text-xs text-fg-subtle">Chỉ người đang ở khu trọ này và chủ trọ thấy tin của bạn.</p>
          <SubmitButton className="btn w-full">Đăng</SubmitButton>
        </form>
      </details>
      <PostList
        posts={posts}
        actions={(p) =>
          p.mine ? (
            <>
              {!p.closed ? (
                <form action={tenantClosePostAction}>
                  {hidden}
                  <input type="hidden" name="postId" value={p.id} />
                  <input type="hidden" name="action" value="close" />
                  <SubmitButton className="btn-secondary">Đã xong</SubmitButton>
                </form>
              ) : null}
              <form action={tenantClosePostAction}>
                {hidden}
                <input type="hidden" name="postId" value={p.id} />
                <input type="hidden" name="action" value="remove" />
                <SubmitButton className="btn-danger">Gỡ</SubmitButton>
              </form>
            </>
          ) : null
        }
      />
    </>
  );
}
