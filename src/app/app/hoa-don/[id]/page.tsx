import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceView } from "@/components/invoice-view";
import { requireUser } from "@/lib/session";
import { tenantInvoice } from "@/server/tenant";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const inv = await tenantInvoice(user.id, id);
  if (!inv) notFound();
  return (
    <>
      <Link href="/app" className="mb-3 inline-block text-sm text-stone-500">← Phòng của tôi</Link>
      <InvoiceView inv={inv} />
    </>
  );
}
