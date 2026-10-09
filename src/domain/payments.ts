// Phân bổ thanh toán vào hóa đơn và trạng thái công nợ. Hàm thuần.

import type { IsoDate } from "./dates";
import { assertDong, type Dong } from "./money";

export interface OpenInvoice {
  id: string;
  dueDate: IsoDate;
  issuedAt: string;
  /** Tổng sau điều chỉnh. */
  total: Dong;
  /** Đã phân bổ trước đó. */
  paid: Dong;
}

export interface Allocation {
  invoiceId: string;
  amount: Dong;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Phần thừa chưa phân bổ (trả trước cho kỳ sau). */
  unallocated: Dong;
}

/**
 * Phân bổ `amount` vào các hóa đơn còn nợ, cũ nhất trước (theo hạn rồi ngày phát hành).
 * Nếu `targetInvoiceIds` có giá trị, chỉ phân bổ vào các hóa đơn đó, theo đúng thứ tự đã cho.
 */
export function allocatePayment(
  amount: Dong,
  invoices: OpenInvoice[],
  targetInvoiceIds?: string[],
): AllocationResult {
  assertDong(amount, "số tiền thanh toán");
  if (amount <= 0) throw new Error("Số tiền thanh toán phải lớn hơn 0");

  let ordered: OpenInvoice[];
  if (targetInvoiceIds && targetInvoiceIds.length) {
    ordered = targetInvoiceIds.map((id) => {
      const inv = invoices.find((i) => i.id === id);
      if (!inv) throw new Error(`Không tìm thấy hóa đơn ${id}`);
      return inv;
    });
  } else {
    ordered = [...invoices].sort((a, b) =>
      a.dueDate !== b.dueDate ? (a.dueDate < b.dueDate ? -1 : 1) : a.issuedAt < b.issuedAt ? -1 : 1,
    );
  }

  let remaining = amount;
  const allocations: Allocation[] = [];
  for (const inv of ordered) {
    if (remaining === 0) break;
    const due = inv.total - inv.paid;
    if (due <= 0) continue;
    const take = Math.min(due, remaining);
    allocations.push({ invoiceId: inv.id, amount: take });
    remaining -= take;
  }
  return { allocations, unallocated: remaining };
}

export type InvoiceStatus = "draft" | "issued" | "void";
export type PaymentState = "draft" | "void" | "unpaid" | "partial" | "paid" | "overdue";

/** Trạng thái hiển thị của hóa đơn từ trạng thái lưu trữ, số đã trả và ngày hôm nay. */
export function paymentState(
  status: InvoiceStatus,
  total: Dong,
  paid: Dong,
  dueDate: IsoDate,
  today: IsoDate,
): PaymentState {
  if (status === "draft") return "draft";
  if (status === "void") return "void";
  if (paid >= total) return "paid";
  if (today > dueDate) return "overdue";
  return paid > 0 ? "partial" : "unpaid";
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  draft: "Nháp",
  void: "Đã hủy",
  unpaid: "Chưa trả",
  partial: "Trả một phần",
  paid: "Đã trả",
  overdue: "Quá hạn",
};
