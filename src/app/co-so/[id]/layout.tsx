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
      <main className="mx-auto max-w-5xl px-4 py-6 pb-16">{children}</main>
    </div>
  );
}
