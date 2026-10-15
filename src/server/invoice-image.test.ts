import { describe, expect, it } from "vitest";
import { invoiceImage } from "./invoice-image";
import type { PublicInvoice } from "./share";

const inv: PublicInvoice = {
  code: "2609-101-ABCD",
  status: "issued",
  propertyName: "CHDV Sunrise",
  unitCode: "101",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  dueDate: "2026-10-10",
  total: 3_656_000,
  paid: 2_000_000,
  lines: [
    { description: "Tiền phòng", amount: 3_000_000 },
    { description: "Điện: 1.000 → 1.120 = 120 kWh", amount: 456_000 },
  ],
  adjustments: [{ reason: "Giảm tiền nước", amount: 200_000 }],
  bank: { accountNo: "88880001234", accountName: "NGUYEN VAN AN", bankBin: "970416" },
  qrPayload: "00020101021238570010A000000727012700069704160113888800012340208QRIBFTTA53037045407165600058028VN62170813" + "2609-101-ABCD" + "6304ABCD",
};

describe("ảnh hóa đơn", () => {
  it("ra PNG, chiều cao theo số dòng, có link thì cao hơn", async () => {
    const a = await invoiceImage(inv, null);
    expect(a.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await a.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const h = (b: Uint8Array) => new DataView(b.buffer).getUint32(20);
    const withLink = new Uint8Array(await (await invoiceImage(inv, "https://khuminh.vn/hd/x")).arrayBuffer());
    expect(h(withLink)).toBeGreaterThan(h(bytes));
  });

  it("hóa đơn đã hủy vẫn vẽ được, không có QR", async () => {
    const a = await invoiceImage({ ...inv, status: "void", qrPayload: null }, null);
    expect(a.status).toBe(200);
    expect((await a.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});
