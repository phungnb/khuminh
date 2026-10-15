import { describe, expect, it } from "vitest";
import { computeSettlement, fullMonthTopUp, type SettlementInput } from "./deposit";
import { roundTo } from "./money";

const base: SettlementInput = { depositHeld: 5_000_000, invoices: [], unallocatedCredit: 0, fullMonthTopUp: 0, deductions: [] };

describe("computeSettlement", () => {
  it("không nợ: hoàn đủ cọc", () => {
    expect(computeSettlement(base)).toEqual({
      debtBefore: 0, deductionTotal: 0, debtAfter: 0, creditApplied: 0, depositApplied: 0, refundDue: 5_000_000, tenantOwes: 0,
    });
  });

  it("nợ nhiều hóa đơn + khấu trừ, cọc đủ: chủ hoàn phần còn lại", () => {
    const r = computeSettlement({
      ...base,
      invoices: [{ total: 3_656_000, paid: 2_000_000 }, { total: 1_234_000, paid: 0 }, { total: 500_000, paid: 500_000 }],
      deductions: [{ reason: "Sơn lại tường", amount: 300_000 }, { reason: "Vệ sinh", amount: 150_000 }],
    });
    expect(r.debtBefore).toBe(2_890_000);
    expect(r.deductionTotal).toBe(450_000);
    expect(r.debtAfter).toBe(3_340_000);
    expect(r.depositApplied).toBe(3_340_000);
    expect(r.refundDue).toBe(1_660_000);
    expect(r.tenantOwes).toBe(0);
  });

  it("nợ vượt cọc: khách trả thêm, không hoàn", () => {
    const r = computeSettlement({ ...base, depositHeld: 2_000_000, invoices: [{ total: 3_000_000, paid: 0 }], deductions: [{ reason: "Hỏng khóa", amount: 200_000 }] });
    expect(r).toMatchObject({ depositApplied: 2_000_000, refundDue: 0, tenantOwes: 1_200_000 });
  });

  it("nợ đúng bằng cọc: tất toán", () => {
    const r = computeSettlement({ ...base, invoices: [{ total: 5_000_000, paid: 0 }] });
    expect(r).toMatchObject({ refundDue: 0, tenantOwes: 0, depositApplied: 5_000_000 });
  });

  it("không có cọc", () => {
    const r = computeSettlement({ ...base, depositHeld: 0, invoices: [{ total: 1_000_000, paid: 400_000 }] });
    expect(r).toMatchObject({ depositApplied: 0, refundDue: 0, tenantOwes: 600_000 });
  });

  it("khách trả dư trước đó: không nợ thì cộng vào tiền hoàn", () => {
    const r = computeSettlement({ ...base, invoices: [{ total: 1_000_000, paid: 1_000_000 }], unallocatedCredit: 380_000 });
    expect(r).toMatchObject({ creditApplied: 0, refundDue: 5_380_000, tenantOwes: 0 });
  });

  it("trả dư dùng trừ nợ trước cọc (nợ phát sinh từ khấu trừ)", () => {
    const r = computeSettlement({ ...base, depositHeld: 1_000_000, unallocatedCredit: 300_000, deductions: [{ reason: "Sửa vòi", amount: 500_000 }] });
    expect(r).toMatchObject({ debtAfter: 500_000, creditApplied: 300_000, depositApplied: 200_000, refundDue: 800_000, tenantOwes: 0 });
  });

  it("đủ tháng dở cộng vào nợ", () => {
    const r = computeSettlement({ ...base, invoices: [{ total: 1_548_000, paid: 0 }], fullMonthTopUp: 1_548_387 });
    expect(r.debtAfter).toBe(3_096_387);
    expect(r.refundDue).toBe(1_903_613);
  });

  it("số sai bị chặn", () => {
    expect(() => computeSettlement({ ...base, depositHeld: -1 })).toThrow(/âm/);
    expect(() => computeSettlement({ ...base, depositHeld: 1.5 })).toThrow(/số nguyên/);
    expect(() => computeSettlement({ ...base, deductions: [{ reason: "x", amount: 0 }] })).toThrow(/lớn hơn 0/);
    expect(() => computeSettlement({ ...base, deductions: [{ reason: " ", amount: 10 }] })).toThrow(/lý do/);
    expect(() => computeSettlement({ ...base, invoices: [{ total: 10, paid: 11 }] })).toThrow(/lớn hơn tổng/);
  });
});

describe("fullMonthTopUp", () => {
  it("chuyển đi ngày 15 tháng 31 ngày: bù phần 16 ngày còn lại", () => {
    // Hóa đơn theo ngày: 3.200.000 × 15/31 = 1.548.387 (domain/billing làm tròn nửa lên).
    expect(fullMonthTopUp(3_200_000, 1_548_387)).toBe(1_651_613);
  });
  it("gợi ý làm tròn theo mức của cơ sở (quyết định 15/10/2026)", () => {
    // 3.600.000 × 12/31 = 1.393.548 → bù 2.206.452 → làm tròn 1.000đ: 2.206.000
    expect(roundTo(fullMonthTopUp(3_600_000, 1_393_548), 1_000)).toBe(2_206_000);
  });
  it("đã đủ tháng thì không bù, không âm", () => {
    expect(fullMonthTopUp(3_200_000, 3_200_000)).toBe(0);
    expect(fullMonthTopUp(3_000_000, 3_200_000)).toBe(0);
  });
});
