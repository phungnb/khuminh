import Link from "next/link";
import { notFound } from "next/navigation";
import { ManageHeader } from "@/components/manage-header";
import { requireActor } from "@/lib/session";
import { getProperty } from "@/server/queries";
import { CoSoTabs } from "./tabs";

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const property = await getProperty(actor, id);
  if (!property) notFound();
  return (
    <div>
      <ManageHeader crumbs={[{ label: "Quản lý khu", href: "/quan-ly" }, { label: property.name }]}>
        <CoSoTabs id={id} />
      </ManageHeader>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-16">
        {property.archivedAt ? (
          <p className="card mb-4 border-warning/40 text-sm">
            Khu này đang được lưu trữ, cư dân không còn thấy trong chợ và Hôm nay.{" "}
            <Link href={`/co-so/${id}/bieu-phi#khu`} className="font-semibold text-brand-ink">Khôi phục</Link>
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
