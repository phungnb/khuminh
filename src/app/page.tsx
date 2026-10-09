import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { listProperties } from "@/server/queries";

export default async function Home() {
  const actor = await requireActor();
  const props = await listProperties(actor);
  redirect(props[0] ? `/co-so/${props[0].id}` : "/co-so/moi");
}
