"use server";

import { randomUUID } from "node:crypto";
import { runAction } from "@/lib/action";
import { parseIntField, parseMoney, parseReading } from "@/lib/format";
import { parseLocation } from "@/lib/geo";
import { requireActor } from "@/lib/session";
import { UserError } from "@/server/audit";
import { adjustInvoice, generateDrafts, issueInvoices, voidInvoice } from "@/server/billing";
import { setPropertyLocation } from "@/server/market";
import { recordPayment, voidPayment } from "@/server/payments";
import {
  changeRent,
  createLease,
  createProperty,
  importUnits,
  moveOut,
  openPeriod,
  recordReadings,
  setFeeRule,
  updateProperty,
  type PropertyInput,
} from "@/server/setup";
import type { FeeMethod, MeterKind } from "@/domain/billing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function propertyInput(f: FormData): PropertyInput {
  return {
    name: str(f, "name"),
    address: str(f, "address"),
    roundTotalTo: Number(str(f, "roundTotalTo") || 1),
    dueDays: parseIntField(f.get("dueDays") || "10"),
    bankBin: str(f, "bankBin") || null,
    bankAccountNo: str(f, "bankAccountNo") || null,
    bankAccountName: str(f, "bankAccountName") || null,
  };
}

function money(f: FormData, k: string, label: string): number {
  const v = parseMoney(f.get(k));
  if (Number.isNaN(v)) throw new UserError(`${label} phải là số nguyên đồng`);
  return v;
}

export async function createPropertyAction(f: FormData) {
  const actor = await requireActor();
  await runAction("/co-so/moi", async () => {
    const id = await createProperty(actor, propertyInput(f));
    // Biểu phí mặc định phổ biến; chủ trọ sửa giá ở trang Biểu phí.
    const from = "2000-01-01";
    await setFeeRule(actor, { propertyId: id, key: "electricity", name: "Điện", method: "metered", meterKind: "electricity", unitPrice: 3_500, unitLabel: "kWh", prorate: false, effectiveFrom: from });
    await setFeeRule(actor, { propertyId: id, key: "water", name: "Nước", method: "per_person", unitPrice: 100_000, unitLabel: "người", prorate: true, effectiveFrom: from });
    return `/co-so/${id}/phong`;
  }, "Đã tạo cơ sở. Tiếp theo: thêm phòng.");
}

export async function updatePropertyAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/bieu-phi`, () => updateProperty(actor, id, propertyInput(f)), "Đã lưu");
}

/** Mỗi dòng một phòng: "101" hoặc "A,101" (dãy, mã phòng). Dán được từ Excel (tab). */
export async function importUnitsAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/phong`, async () => {
    const rows = str(f, "rows")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split(/[\t,;]/).map((p) => p.trim());
        return parts.length >= 2 ? { block: parts[0], code: parts[1]! } : { code: parts[0]! };
      });
    if (rows.length === 0) throw new UserError("Chưa nhập phòng nào");
    const kinds: MeterKind[] = f.get("waterMeter") ? ["electricity", "water"] : ["electricity"];
    const res = await importUnits(actor, id, rows, kinds);
    if (res.errors.length) {
      throw new UserError(res.errors.map((e) => (e.row ? `Dòng ${e.row}: ${e.message}` : e.message)).join(". "));
    }
  }, "Đã thêm phòng");
}

export async function createLeaseAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  const unitId = str(f, "unitId");
  await runAction(`/co-so/${id}/phong/${unitId}`, async () => {
    const parking = parseIntField(f.get("parking") || "0");
    await createLease(actor, {
      unitId,
      tenant: { fullName: str(f, "fullName"), phone: str(f, "phone") || null },
      startDate: str(f, "startDate"),
      expiresOn: str(f, "expiresOn") || null,
      deposit: money(f, "deposit", "Tiền cọc"),
      rent: money(f, "rent", "Giá thuê"),
      occupants: parseIntField(f.get("occupants")),
      quantities: Number.isNaN(parking) ? {} : { parking },
    });
    return `/co-so/${id}/phong`;
  }, "Đã thêm hợp đồng");
}

export async function changeRentAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/phong/${str(f, "unitId")}`;
  await runAction(back, () => changeRent(actor, str(f, "leaseId"), str(f, "effectiveFrom"), money(f, "amount", "Giá thuê")), "Đã đổi giá thuê");
}

export async function moveOutAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/phong/${str(f, "unitId")}`;
  await runAction(back, () => moveOut(actor, str(f, "leaseId"), str(f, "lastDay")), "Đã ghi nhận chuyển đi. Nhớ ghi chỉ số ngày chuyển đi.");
}

export async function recordReadingsAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  const date = str(f, "date");
  await runAction(`/co-so/${id}/chi-so?ngay=${date}`, async () => {
    const readings: Array<{ meterId: string; date: string; value: number }> = [];
    for (const [k, v] of f.entries()) {
      if (!k.startsWith("m_")) continue;
      const value = parseReading(v);
      if (value === null) continue;
      if (Number.isNaN(value)) throw new UserError(`Chỉ số "${String(v)}" không hợp lệ`);
      readings.push({ meterId: k.slice(2), date, value });
    }
    if (readings.length === 0) throw new UserError("Chưa nhập chỉ số nào");
    await recordReadings(actor, readings);
  }, "Đã lưu chỉ số");
}

export async function setFeeRuleAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/bieu-phi`, async () => {
    const method = str(f, "method") as FeeMethod;
    await setFeeRule(actor, {
      propertyId: id,
      key: str(f, "key"),
      name: str(f, "name"),
      method,
      unitPrice: money(f, "unitPrice", "Đơn giá"),
      meterKind: method === "metered" ? (str(f, "meterKind") as MeterKind) : null,
      unitLabel: str(f, "unitLabel") || null,
      prorate: f.get("prorate") === "on",
      effectiveFrom: str(f, "effectiveFrom"),
    });
  }, "Đã lưu khoản phí");
}

export async function openPeriodAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/ky`, async () => {
    const pid = await openPeriod(actor, id, str(f, "start"), str(f, "end"));
    return `/co-so/${id}/ky/${pid}`;
  });
}

export async function generateDraftsAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/ky/${str(f, "periodId")}`;
  await runAction(back, async () => {
    const res = await generateDrafts(actor, str(f, "periodId"));
    const failed = res.filter((r) => r.errors.length);
    if (failed.length) {
      const msg = failed.map((r) => `Phòng ${r.unitCode}: ${r.errors.map((e) => e.message).join("; ")}`).join(". ");
      return `${back}?loi=${encodeURIComponent(`Chưa lập được ${failed.length} hóa đơn. ${msg}`)}`;
    }
  }, "Đã lập hóa đơn nháp. Kiểm tra rồi bấm Phát hành.");
}

export async function issueAllAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/ky/${str(f, "periodId")}`;
  await runAction(back, async () => {
    const ids = f.getAll("invoiceId").map(String);
    const n = await issueInvoices(actor, ids);
    if (n === 0) throw new UserError("Không có hóa đơn nháp để phát hành");
    const { notifyInvoicesIssued } = await import("@/server/push");
    const pushed = await notifyInvoicesIssued(actor, ids).catch((e) => (console.error(e), 0));
    const msg = pushed
      ? `Đã phát hành. Đã báo ${pushed} thiết bị trong app; phòng chưa dùng app thì gửi link.`
      : "Đã phát hành. Gửi link cho từng phòng.";
    return `${back}?ok=${encodeURIComponent(msg)}`;
  });
}

export async function recordPaymentAction(f: FormData) {
  const actor = await requireActor();
  const back = str(f, "back");
  await runAction(back, async () => {
    const r = await recordPayment(actor, {
      leaseId: str(f, "leaseId"),
      amount: money(f, "amount", "Số tiền"),
      method: (str(f, "method") || "transfer") as "cash" | "transfer" | "other",
      receivedOn: str(f, "receivedOn"),
      reference: str(f, "reference"),
      invoiceIds: str(f, "invoiceId") ? [str(f, "invoiceId")] : undefined,
      idempotencyKey: str(f, "idempotencyKey") || randomUUID(),
    });
    if (r.unallocated > 0) {
      return `${back}?ok=${encodeURIComponent(`Đã ghi nhận. Dư ${r.unallocated.toLocaleString("vi-VN")}đ sẽ trừ vào kỳ sau.`)}`;
    }
  }, "Đã ghi nhận thanh toán");
}

export async function voidPaymentAction(f: FormData) {
  const actor = await requireActor();
  await runAction(str(f, "back"), () => voidPayment(actor, str(f, "paymentId"), str(f, "reason")), "Đã hủy thanh toán");
}

export async function adjustInvoiceAction(f: FormData) {
  const actor = await requireActor();
  await runAction(
    str(f, "back"),
    () => adjustInvoice(actor, str(f, "invoiceId"), money(f, "amount", "Số tiền điều chỉnh"), str(f, "reason")),
    "Đã điều chỉnh",
  );
}

export async function voidInvoiceAction(f: FormData) {
  const actor = await requireActor();
  await runAction(str(f, "back"), () => voidInvoice(actor, str(f, "invoiceId"), str(f, "reason")), "Đã hủy hóa đơn");
}

export async function createShareLinkAction(f: FormData) {
  const actor = await requireActor();
  const back = str(f, "back");
  await runAction(back, async () => {
    const { createShareLink } = await import("@/server/share");
    const { token } = await createShareLink(actor, str(f, "invoiceId"));
    return `${back}?link=${token}`;
  });
}

export async function createTenantInviteAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/phong/${str(f, "unitId")}`;
  await runAction(back, async () => {
    const { createTenantInvite } = await import("@/server/tenant");
    const { token } = await createTenantInvite(actor, str(f, "leaseId"));
    return `${back}?moi=${token}`;
  });
}

export async function createPostAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/bang-tin`, async () => {
    const { createPost, managerBoardViewer } = await import("@/server/board");
    const kind = (str(f, "kind") || "announcement") as "announcement";
    const price = str(f, "price") ? money(f, "price", "Giá") : null;
    await createPost(await managerBoardViewer(actor, id), { kind, title: str(f, "title"), body: str(f, "body"), price });
  }, "Đã đăng. Người thuê dùng app sẽ nhận thông báo.");
}

export async function hidePostAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/bang-tin`, async () => {
    const { closePost, managerBoardViewer } = await import("@/server/board");
    await closePost(await managerBoardViewer(actor, id), str(f, "postId"), "remove");
  }, "Đã ẩn tin");
}

export async function createStaffInviteAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/bieu-phi`, async () => {
    const { createStaffInvite } = await import("@/server/staff");
    const { token } = await createStaffInvite(actor, id);
    return `/co-so/${id}/bieu-phi?nv=${token}#nhan-vien`;
  });
}

export async function removeStaffAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/bieu-phi`, async () => {
    const { removeStaff } = await import("@/server/staff");
    await removeStaff(actor, id, str(f, "userId"));
  }, "Đã bỏ nhân viên khỏi cơ sở");
}

export async function setLocationAction(f: FormData) {
  const actor = await requireActor();
  const id = str(f, "propertyId");
  await runAction(`/co-so/${id}/bieu-phi`, async () => {
    const raw = str(f, "location");
    const loc = raw ? parseLocation(raw) : null;
    if (raw && !loc) {
      throw new UserError("Không đọc được tọa độ. Dán link Google Maps đầy đủ (có @vĩ độ,kinh độ) hoặc nhập dạng 10.77, 106.70");
    }
    await setPropertyLocation(actor, id, loc);
  }, "Đã lưu vị trí");
}

export async function updateMaintenanceAction(f: FormData) {
  const actor = await requireActor();
  const back = `/co-so/${str(f, "propertyId")}/su-co`;
  await runAction(back, async () => {
    const { updateMaintenanceStatus } = await import("@/server/maintenance");
    await updateMaintenanceStatus(actor, str(f, "requestId"), str(f, "status") as "in_progress" | "done" | "rejected", str(f, "note"));
  }, "Đã cập nhật, người thuê sẽ nhận thông báo");
}
