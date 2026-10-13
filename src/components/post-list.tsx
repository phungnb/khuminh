import { POST_KIND_LABEL, type PostRow } from "@/server/board";
import { vnd } from "@/lib/format";

const KIND_STYLE: Record<string, string> = {
  announcement: "bg-teal-100 text-teal-800",
  sell: "bg-amber-100 text-amber-800",
  give: "bg-emerald-100 text-emerald-800",
  want: "bg-sky-100 text-sky-800",
};

function ago(d: Date): string {
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 60) return `${Math.max(1, min)} phút trước`;
  if (min < 1440) return `${Math.floor(min / 60)} giờ trước`;
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Danh sách tin; `actions` vẽ nút thao tác cho từng tin (khác nhau giữa chủ trọ và người thuê). */
export function PostList({ posts, actions }: { posts: PostRow[]; actions?: (p: PostRow) => React.ReactNode }) {
  if (posts.length === 0) return <p className="card text-center text-sm text-fg-subtle">Chưa có tin nào.</p>;
  return (
    <ul className="space-y-3">
      {posts.map((p) => (
        <li key={p.id} className={`card ${p.closed || p.hidden ? "opacity-60" : ""}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded px-2 py-0.5 font-semibold ${KIND_STYLE[p.kind]}`}>{POST_KIND_LABEL[p.kind]}</span>
            {p.closed ? <span className="rounded bg-surface-2 px-2 py-0.5 font-semibold text-fg-muted">Đã xong</span> : null}
            {p.hidden ? <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-700">Đã ẩn</span> : null}
            <span className="text-fg-subtle">
              {p.authorName}
              {p.fromManager ? " · Chủ trọ" : ""} · {ago(p.createdAt)}
            </span>
          </div>
          <h3 className="font-semibold">{p.title}</h3>
          {p.price !== null ? <p className="font-semibold text-brand-ink">{vnd(p.price)}</p> : null}
          {p.body ? <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{p.body}</p> : null}
          {actions ? <div className="mt-2 flex gap-2">{actions(p)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
