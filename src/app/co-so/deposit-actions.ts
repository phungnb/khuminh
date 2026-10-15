"use server";

// Thao tác quyết toán cọc ở trang phòng (KM-COC). Tính và ghi nằm ở src/server/deposit.ts.

import { runAction } from "@/lib/action";
import { parseMoney } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { ForbiddenError, UserError } from "@/server/audit";
import { markRefunded, previewSettlement, settleDeposit, voidSettlement, type SettleInput } from "@/server/deposit";
import type { SettlementResult } from "@/domain/deposit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function money(f: FormData, k: string, label: string): number {
  const v = parseMoney(f.get(k));
  if (Number.isNaN(v)) throw new UserError(`${label} phải là số nguyên đồng`);
  return v;
}

function settleInput(f: FormData): SettleInput {
  const deductions: SettleInput["deductions"] = [];
  for (let i = 0; i < 5; i++) {
    const reason = str(f, `d_reason_${i}`);
    const raw = str(f, `d_amount_${i}`);
    if (!reason && !raw) continue;
    if (!reason) throw new UserError("Mỗi khoản khấu trừ cần ghi lý do");
    deductions.push({ reason, amount: money(f, `d_amount_${i}`, `Khoản khấu trừ "${reason}"`) });
  }
  const lastMonthMode = str(f, "lastMonthMode") === "full_month" ? "full_month" : "daily";
  return {
    leaseId: str(f, "leaseId"),
    settledOn: str(f, "settledOn"),
    lastMonthMode,
    topUp: lastMonthMode === "full_month" && str(f, "topUp") ? money(f, "topUp", "Tiền bù đủ tháng") : null,
    depositHeld: money(f, "depositHeld", "Tiền cọc thực giữ"),
    depositHeldNote: str(f, "depositHeldNote") || null,
    deductions,
    note: str(f, "note") || null,
  };
}

export type PreviewState = { result?: SettlementResult & { topUp: number }; error?: string; key?: string } | null;

/** Xem trước số quyết toán (không ghi gì). Dùng với useActionState ở form trả phòng. */
export async function previewSettlementAction(_prev: PreviewState, f: FormData): Promise<PreviewState> {
  const actor = await requireActor();
  try {
    const input = settleInput(f);
    const result = await previewSettlement(actor, input);
    // Khóa để nút xác nhận chỉ ghi đúng bộ số vừa xem.
    return { result, key: JSON.stringify(input) };
  } catch (e) {
    if (e instanceof UserError || e instanceof ForbiddenError) return { error: e.message };
    if (e instanceof Error && /số nguyên|không hợp lệ/.test(e.message)) return { error: e.message };
    console.error(e);
    return { error: "Có lỗi hệ thống, vui lòng thử lại" };
  }
}

export async function settleDepositAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/phong/${str(f, "unitId")}`;
  await runAction(back, async () => {
    const input = JSON.parse(str(f, "key")) as SettleInput;
    await settleDeposit(actor, input);
  }, "Đã quyết toán cọc. Gửi phiếu cho người thuê.");
}

export async function markRefundedAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/phong/${str(f, "unitId")}`;
  const method = str(f, "method") as "cash" | "transfer" | "other";
  await runAction(back, () => markRefunded(actor, str(f, "settlementId"), str(f, "refundedOn"), method), "Đã ghi nhận hoàn cọc");
}

export async function voidSettlementAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/phong/${str(f, "unitId")}`;
  await runAction(back, () => voidSettlement(actor, str(f, "settlementId"), str(f, "reason")), "Đã hủy quyết toán");
}
