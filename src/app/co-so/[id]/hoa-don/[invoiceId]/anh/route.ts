import { notFound } from "next/navigation";
import { withOrg } from "@/db/client";
import { requireActor } from "@/lib/session";
import { invoiceImage } from "@/server/invoice-image";
import { getProperty, invoiceDetail } from "@/server/queries";
import { loadInvoiceView } from "@/server/share";

// Ảnh hóa đơn cho chủ trọ/nhân viên của cơ sở. Hóa đơn nháp không có ảnh.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;
  const actor = await requireActor();
  const [property, d] = await Promise.all([getProperty(actor, id), invoiceDetail(actor, invoiceId)]);
  if (!property || !d || d.inv.propertyId !== id) notFound();
  const inv = await withOrg(actor, (tx) => loadInvoiceView(tx, invoiceId));
  if (!inv) notFound();
  return invoiceImage(inv, null);
}
