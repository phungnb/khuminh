import { Flash, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/session";
import { createPropertyAction } from "../actions";
import { PropertyFields } from "../property-fields";

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  await requireActor();
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <PageTitle>Tạo cơ sở cho thuê</PageTitle>
      <Flash params={sp} />
      <form action={createPropertyAction} className="card space-y-3">
        <PropertyFields />
        <button className="btn">Tạo cơ sở</button>
      </form>
    </main>
  );
}
