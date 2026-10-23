import { currentUser } from "@/lib/session";
import { getListingImage } from "@/server/market";

/**
 * Phát ảnh tin đăng (lưu bytea trong CSDL). Chỉ người đã đăng nhập, và RLS của
 * listing_images quyết định ảnh có thuộc tin người này được xem hay không.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const { id } = await params;
  const img = await getListingImage(user.id, id);
  if (!img) return new Response("Không thấy ảnh", { status: 404 });
  return new Response(Buffer.from(img.data), {
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
