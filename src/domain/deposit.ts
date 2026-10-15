// Quyết toán cọc khi trả phòng. Hàm thuần, tiền là số nguyên đồng (KM-COC đặc tả v1.1 mục 3).
//
//   Nợ sau khấu trừ = Σ(tổng − đã trả) hóa đơn đã phát hành + bù đủ tháng dở + Σ khấu trừ
//   Dùng tiền trả dư = min(tiền khách trả dư chưa phân bổ, nợ sau khấu trừ)   (trả dư dùng trước cọc)
//   Cấn trừ cọc     = min(cọc giữ, nợ sau khấu trừ − dùng tiền trả dư)
//   Chủ hoàn        = cọc giữ − cấn trừ + phần trả dư còn lại
//   Khách trả thêm  = nợ sau khấu trừ − dùng tiền trả dư − cấn trừ
// Không làm tròn thêm: hóa đơn cuối đã làm tròn theo cơ sở; khấu trừ và bù tháng là số nguyên đồng.

import { assertDong, type Dong } from "./money";

/** Tiền phòng tháng cuối: tính theo ngày ở (như hóa đơn kỳ) hay thu đủ tháng dở. */
export type LastMonthMode = "daily" | "full_month";

export interface Deduction {
  reason: string;
  amount: Dong;
}

export interface SettlementInput {
  depositHeld: Dong;
  /** Hóa đơn đã phát hành của hợp đồng, kể cả hóa đơn cuối. */
  invoices: Array<{ total: Dong; paid: Dong }>;
  /** Phần thanh toán khách đã trả dư, chưa phân bổ vào hóa đơn nào. */
  unallocatedCredit: Dong;
  /** Dòng bù "tiền phòng đủ tháng dở" (0 khi tính theo ngày). */
  fullMonthTopUp: Dong;
  deductions: Deduction[];
}

export interface SettlementResult {
  /** Nợ trước khi bù tháng và khấu trừ. */
  debtBefore: Dong;
  deductionTotal: Dong;
  debtAfter: Dong;
  /** Phần tiền khách trả dư được dùng trừ nợ (trước khi trừ cọc). */
  creditApplied: Dong;
  depositApplied: Dong;
  /** Chủ trọ phải trả lại khách (≥ 0). */
  refundDue: Dong;
  /** Khách còn phải trả thêm (≥ 0). */
  tenantOwes: Dong;
}

export class SettlementError extends Error {}

/**
 * Bù để tiền phòng tháng cuối thành đủ một tháng: giá tháng − tiền phòng đã tính theo ngày trên hóa đơn cuối.
 * Không âm: hóa đơn đã tính đủ tháng thì không bù.
 */
export function fullMonthTopUp(monthlyRent: Dong, rentOnFinalInvoice: Dong): Dong {
  assertDong(monthlyRent, "giá thuê tháng");
  assertDong(rentOnFinalInvoice, "tiền phòng trên hóa đơn cuối");
  return Math.max(0, monthlyRent - rentOnFinalInvoice);
}

export function computeSettlement(input: SettlementInput): SettlementResult {
  assertDong(input.depositHeld, "tiền cọc");
  if (input.depositHeld < 0) throw new SettlementError("Tiền cọc không được âm");
  assertDong(input.unallocatedCredit, "tiền trả dư");
  if (input.unallocatedCredit < 0) throw new SettlementError("Tiền trả dư không được âm");
  assertDong(input.fullMonthTopUp, "tiền bù tháng");
  if (input.fullMonthTopUp < 0) throw new SettlementError("Tiền bù tháng không được âm");

  let deductionTotal = 0;
  for (const d of input.deductions) {
    assertDong(d.amount, "khoản khấu trừ");
    if (d.amount <= 0) throw new SettlementError("Mỗi khoản khấu trừ phải lớn hơn 0");
    if (!d.reason.trim()) throw new SettlementError("Mỗi khoản khấu trừ cần ghi lý do");
    deductionTotal += d.amount;
  }

  let debtBefore = 0;
  for (const i of input.invoices) {
    assertDong(i.total, "tổng hóa đơn");
    assertDong(i.paid, "đã trả");
    if (i.paid > i.total) throw new SettlementError("Hóa đơn có số đã trả lớn hơn tổng");
    debtBefore += i.total - i.paid;
  }

  const debtAfter = debtBefore + input.fullMonthTopUp + deductionTotal;
  const creditApplied = Math.min(input.unallocatedCredit, debtAfter);
  const depositApplied = Math.min(input.depositHeld, debtAfter - creditApplied);
  return {
    debtBefore,
    deductionTotal,
    debtAfter,
    creditApplied,
    depositApplied,
    refundDue: input.depositHeld - depositApplied + (input.unallocatedCredit - creditApplied),
    tenantOwes: debtAfter - creditApplied - depositApplied,
  };
}
