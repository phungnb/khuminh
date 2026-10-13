import Link from "next/link";
import { PostList } from "@/components/post-list";
import { Flash } from "@/components/ui";
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
    return <p className="card text-center text-sm text-stone-600">Bảng tin chỉ dành cho người đang ở trong khu trọ.</p>;
  }
  const cs = places.some(([k]) => k === sp.cs) ? sp.cs! : places[0]![0];
  const [orgId, propertyId] = cs.split(".") as [string, string];
  const posts = await listPosts(await tenantBoardViewer(user.id, orgId, propertyId));
  const hidden = <input type="hidden" name="cs" value={cs} />;

  return (
    <>
      {places.length > 1 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {places.map(([k, name]) => (
            <Link key={k} href={`/app/bang-tin?cs=${k}`} className={k === cs ? "btn" : "btn-secondary"}>
              {name}
            </Link>
          ))}
        </div>
      ) : null}
      <h1 className="mb-3 text-xl font-bold">Bảng tin {places.find(([k]) => k === cs)![1]}</h1>
      <Flash params={sp} />
      <details className="card mb-4">
        <summary className="cursor-pointer font-semibold text-brand">+ Đăng tin rao vặt</summary>
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
          <p className="text-xs text-stone-500">Chỉ người đang ở khu trọ này và chủ trọ thấy tin của bạn.</p>
          <button className="btn w-full">Đăng</button>
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
                  <button className="btn-secondary">Đã xong</button>
                </form>
              ) : null}
              <form action={tenantClosePostAction}>
                {hidden}
                <input type="hidden" name="postId" value={p.id} />
                <input type="hidden" name="action" value="remove" />
                <button className="btn-danger">Gỡ</button>
              </form>
            </>
          ) : null
        }
      />
    </>
  );
}
