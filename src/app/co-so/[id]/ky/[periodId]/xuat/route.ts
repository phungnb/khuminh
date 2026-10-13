import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { exportPeriodXlsx } from "@/server/export";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  const { id, periodId } = await params;
  const actor = await requireActor();
  const file = await exportPeriodXlsx(actor, id, periodId);
  if (!file) notFound();
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
