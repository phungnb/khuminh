import { notFound } from "next/navigation";
import { baseUrl } from "@/lib/url";
import { invoiceImage } from "@/server/invoice-image";
import { resolveShareLink } from "@/server/share";

// Ảnh hóa đơn cho người cầm link: cùng quy tắc token và hạn như trang /hd/[token].
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await resolveShareLink(token);
  if (!inv) notFound();
  return invoiceImage(inv, `${await baseUrl()}/hd/${token}`);
}
