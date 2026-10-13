import { PostList } from "@/components/post-list";
import { Flash, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/session";
import { listPosts, managerBoardViewer } from "@/server/board";
import { createPostAction, hidePostAction } from "../../actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const posts = await listPosts(await managerBoardViewer(actor, id));
  return (
    <>
      <PageTitle>Bảng tin khu trọ</PageTitle>
      <Flash params={await searchParams} />
      <form action={createPostAction} className="card mb-6 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <input type="hidden" name="kind" value="announcement" />
        <h2 className="font-semibold">Đăng thông báo</h2>
        <div>
          <label className="label" htmlFor="title">Tiêu đề</label>
          <input className="input" id="title" name="title" maxLength={120} placeholder="Cúp nước 8h-11h thứ Bảy" required />
        </div>
        <div>
          <label className="label" htmlFor="body">Nội dung (tùy chọn)</label>
          <textarea className="input" id="body" name="body" rows={3} maxLength={2000} />
        </div>
        <p className="text-xs text-fg-subtle">Người thuê đã cài app và bật thông báo sẽ nhận ngay trên điện thoại.</p>
        <button className="btn">Đăng</button>
      </form>
      <PostList
        posts={posts}
        actions={(p) =>
          p.hidden ? null : (
            <form action={hidePostAction}>
              <input type="hidden" name="propertyId" value={id} />
              <input type="hidden" name="postId" value={p.id} />
              <button className="btn-danger">Ẩn tin</button>
            </form>
          )
        }
      />
    </>
  );
}
