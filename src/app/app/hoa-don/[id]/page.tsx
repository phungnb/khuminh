import { notFound } from "next/navigation";
import { InvoiceView } from "@/components/invoice-view";
import { BackLink } from "@/components/ui";
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
      <BackLink href="/app/nha">Nhà tôi</BackLink>
      <InvoiceView inv={inv} />
    </>
  );
}
