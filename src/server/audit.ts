import type { Tx } from "@/db/client";
import { auditLogs } from "@/db/schema";

export interface Actor {
  orgId: string;
  userId: string;
  role: "owner" | "staff";
}

export class ForbiddenError extends Error {
  constructor(message = "Bạn không có quyền thực hiện thao tác này") {
    super(message);
  }
}

export class UserError extends Error {}

export function requireOwner(actor: Actor): void {
  if (actor.role !== "owner") throw new ForbiddenError();
}

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.insert(auditLogs).values({
    orgId: actor.orgId,
    actorUserId: actor.userId,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
  });
}
