import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { settlementContext } from "@/server/deposit";
import { settlementImage } from "@/server/settlement-image";

// Ảnh phiếu quyết toán cho chủ trọ/nhân viên của cơ sở. ?hd=<mã hợp đồng>.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id } = await params;
  const leaseId = new URL(req.url).searchParams.get("hd") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(leaseId)) notFound();
  const actor = await requireActor();
  const ctx = await settlementContext(actor, leaseId);
  if (!ctx || ctx.propertyId !== id || !ctx.settlement) notFound();
  return settlementImage(ctx, ctx.settlement);
}
