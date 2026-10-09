import { describe, expect, it } from "vitest";
import { allocatePayment, paymentState, type OpenInvoice } from "./payments";
import { buildVietQr, crc16, sanitizeMessage } from "./vietqr";

const invoices: OpenInvoice[] = [
  { id: "nov", dueDate: "2026-11-10", issuedAt: "2026-11-01T00:00:00Z", total: 3_000_000, paid: 0 },
  { id: "oct", dueDate: "2026-10-10", issuedAt: "2026-10-01T00:00:00Z", total: 2_500_000, paid: 1_000_000 },
];

describe("allocatePayment", () => {
  it("trả hóa đơn cũ trước", () => {
    expect(allocatePayment(2_000_000, invoices)).toEqual({
      allocations: [
        { invoiceId: "oct", amount: 1_500_000 },
        { invoiceId: "nov", amount: 500_000 },
      ],
      unallocated: 0,
    });
  });

  it("trả thừa giữ lại phần dư", () => {
    const r = allocatePayment(5_000_000, invoices);
    expect(r.unallocated).toBe(500_000);
    expect(r.allocations.reduce((s, a) => s + a.amount, 0) + r.unallocated).toBe(5_000_000);
  });

  it("chỉ định hóa đơn", () => {
    expect(allocatePayment(1_000_000, invoices, ["nov"]).allocations).toEqual([
      { invoiceId: "nov", amount: 1_000_000 },
    ]);
  });

  it("từ chối số tiền không hợp lệ", () => {
    expect(() => allocatePayment(0, invoices)).toThrow();
    expect(() => allocatePayment(10.5, invoices)).toThrow();
    expect(() => allocatePayment(10, invoices, ["xyz"])).toThrow();
  });
});

describe("paymentState", () => {
  it("phân loại đúng", () => {
    expect(paymentState("issued", 100, 0, "2026-10-10", "2026-10-09")).toBe("unpaid");
    expect(paymentState("issued", 100, 50, "2026-10-10", "2026-10-10")).toBe("partial");
    expect(paymentState("issued", 100, 50, "2026-10-10", "2026-10-11")).toBe("overdue");
    expect(paymentState("issued", 100, 100, "2026-10-10", "2026-12-01")).toBe("paid");
    expect(paymentState("void", 100, 0, "2026-10-10", "2026-12-01")).toBe("void");
    expect(paymentState("draft", 100, 0, "2026-10-10", "2026-12-01")).toBe("draft");
  });
});

describe("VietQR", () => {
  it("CRC-16/CCITT-FALSE chuẩn", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("chuỗi QR có đủ trường và CRC khớp", () => {
    const qr = buildVietQr({ bankBin: "970436", accountNo: "0011001234567", amount: 3_770_000, message: "HD-2610-P101" });
    expect(qr.startsWith("000201010212")).toBe(true);
    expect(qr).toContain("0010A000000727");
    expect(qr).toContain("0006970436");
    expect(qr).toContain("01130011001234567");
    expect(qr).toContain("0208QRIBFTTA");
    expect(qr).toContain("5303704");
    expect(qr).toContain("54073770000");
    expect(qr).toContain("5802VN");
    expect(qr).toContain("62140810HD2610P101");
    const body = qr.slice(0, -4);
    expect(qr.slice(-4)).toBe(crc16(body));
  });

  it("không có số tiền thì là QR tĩnh", () => {
    expect(buildVietQr({ bankBin: "970436", accountNo: "123" }).startsWith("000201010211")).toBe(true);
  });

  it("bỏ dấu nội dung", () => {
    expect(sanitizeMessage("Phòng 101 tháng 10 - Đức")).toBe("Phong 101 thang 10  Duc");
  });

  it("từ chối BIN sai", () => {
    expect(() => buildVietQr({ bankBin: "123", accountNo: "1" })).toThrow();
  });
});
