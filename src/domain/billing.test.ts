import { describe, expect, it } from "vitest";
import { computeInvoice, type BillingInput, type FeeRule } from "./billing";

const OCT = { start: "2026-10-01", end: "2026-10-31" };

const electricity: FeeRule = {
  id: "fr-e1",
  key: "electricity",
  name: "Điện",
  method: "metered",
  meterKind: "electricity",
  unitPrice: 3_500,
  unitLabel: "kWh",
  prorate: false,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};
const water: FeeRule = {
  id: "fr-w1",
  key: "water",
  name: "Nước",
  method: "per_person",
  unitPrice: 100_000,
  prorate: true,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};
const internet: FeeRule = {
  id: "fr-i1",
  key: "internet",
  name: "Internet",
  method: "fixed",
  unitPrice: 100_000,
  prorate: false,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};
const parking: FeeRule = {
  id: "fr-p1",
  key: "parking",
  name: "Gửi xe",
  method: "per_quantity",
  unitPrice: 50_000,
  unitLabel: "xe",
  prorate: true,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

function base(overrides: Partial<BillingInput> = {}): BillingInput {
  return {
    period: OCT,
    lease: {
      id: "l1",
      start: "2026-01-01",
      end: null,
      occupants: 2,
      rents: [{ effectiveFrom: "2026-01-01", amount: 3_000_000 }],
      quantities: { parking: 1 },
    },
    feeRules: [electricity, water, internet, parking],
    meters: [{ id: "m-e", kind: "electricity", name: "Điện" }],
    readings: [
      { meterId: "m-e", date: "2026-09-30", valueCenti: 100_000 },
      { meterId: "m-e", date: "2026-10-31", valueCenti: 112_000 },
    ],
    roundTotalTo: 1,
    ...overrides,
  };
}

describe("computeInvoice — trọn kỳ", () => {
  it("cộng đúng các khoản", () => {
    const r = computeInvoice(base());
    expect(r.errors).toEqual([]);
    const byKey = Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));
    expect(byKey).toEqual({
      rent: 3_000_000,
      electricity: 420_000, // 120 kWh × 3.500
      water: 200_000, // 2 người × 100.000
      internet: 100_000,
      parking: 50_000,
    });
    expect(r.total).toBe(3_770_000);
    expect(r.subtotal).toBe(r.total);
  });

  it("không tạo dòng cho khoản theo số lượng bằng 0", () => {
    const input = base();
    input.lease.quantities = {};
    const r = computeInvoice(input);
    expect(r.lines.find((l) => l.key === "parking")).toBeUndefined();
  });

  it("chỉ số chốt sáng 01/11 vẫn dùng làm cuối kỳ 10", () => {
    const r = computeInvoice(
      base({
        readings: [
          { meterId: "m-e", date: "2026-10-01", valueCenti: 100_000 },
          { meterId: "m-e", date: "2026-11-01", valueCenti: 110_000 },
        ],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.lines.find((l) => l.key === "electricity")?.quantityCenti).toBe(10_000);
  });

  it("số kWh lẻ được làm tròn tới đồng", () => {
    const r = computeInvoice(
      base({
        readings: [
          { meterId: "m-e", date: "2026-09-30", valueCenti: 100_000 },
          { meterId: "m-e", date: "2026-10-31", valueCenti: 100_033 }, // 0,33 kWh
        ],
      }),
    );
    // 0,33 × 3.500 = 1.155
    expect(r.lines.find((l) => l.key === "electricity")?.amount).toBe(1_155);
  });
});

describe("computeInvoice — vào/ra giữa kỳ", () => {
  it("vào ở ngày 15/10: chia theo ngày các khoản có prorate", () => {
    const input = base({
      readings: [
        { meterId: "m-e", date: "2026-10-15", valueCenti: 200_000 },
        { meterId: "m-e", date: "2026-10-31", valueCenti: 205_000 },
      ],
    });
    input.lease.start = "2026-10-15";
    const r = computeInvoice(input);
    expect(r.errors).toEqual([]);
    const byKey = Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));
    // 17/31 ngày
    expect(byKey.rent).toBe(1_645_161); // 3.000.000 × 17 / 31 = 1.645.161,29
    expect(byKey.water).toBe(109_677); // 200.000 × 17 / 31 = 109.677,4
    expect(byKey.parking).toBe(27_419); // 50.000 × 17 / 31 = 27.419,35
    expect(byKey.internet).toBe(100_000); // không prorate
    expect(byKey.electricity).toBe(175_000); // 50 kWh
    expect(r.segment).toEqual({ start: "2026-10-15", end: "2026-10-31" });
  });

  it("người cũ ra 14/10, người mới vào 15/10 dùng chung một lần ghi chỉ số", () => {
    const readings = [
      { meterId: "m-e", date: "2026-09-30", valueCenti: 100_000 },
      { meterId: "m-e", date: "2026-10-15", valueCenti: 103_000 },
      { meterId: "m-e", date: "2026-10-31", valueCenti: 108_000 },
    ];
    const outgoing = base({ readings });
    outgoing.lease.end = "2026-10-14";
    const incoming = base({ readings });
    incoming.lease = { ...incoming.lease, id: "l2", start: "2026-10-15" };

    const a = computeInvoice(outgoing);
    const b = computeInvoice(incoming);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.lines.find((l) => l.key === "electricity")?.quantityCenti).toBe(3_000);
    expect(b.lines.find((l) => l.key === "electricity")?.quantityCenti).toBe(5_000);
    // Tổng tiền phòng hai người không vượt giá trọn kỳ quá 1 đồng do làm tròn.
    const rentA = a.lines.find((l) => l.key === "rent")!.amount;
    const rentB = b.lines.find((l) => l.key === "rent")!.amount;
    expect(Math.abs(rentA + rentB - 3_000_000)).toBeLessThanOrEqual(1);
  });

  it("hợp đồng không giao kỳ thì không có hóa đơn", () => {
    const input = base();
    input.lease.start = "2026-11-01";
    const r = computeInvoice(input);
    expect(r.segment).toBeNull();
    expect(r.lines).toEqual([]);
  });
});

describe("computeInvoice — đổi giá giữa kỳ", () => {
  it("tiền phòng tách hai dòng theo ngày hiệu lực", () => {
    const input = base();
    input.lease.rents = [
      { effectiveFrom: "2026-01-01", amount: 3_000_000 },
      { effectiveFrom: "2026-10-16", amount: 3_100_000 },
    ];
    const r = computeInvoice(input);
    const rent = r.lines.filter((l) => l.key === "rent");
    expect(rent.map((l) => l.amount)).toEqual([
      1_451_613, // 3.000.000 × 15 / 31 = 1.451.612,9
      1_600_000, // 3.100.000 × 16 / 31
    ]);
  });

  it("biểu phí điện dùng phiên bản có hiệu lực cuối đoạn", () => {
    const r = computeInvoice(
      base({
        feeRules: [
          { ...electricity, effectiveTo: "2026-10-19" },
          { ...electricity, id: "fr-e2", unitPrice: 4_000, effectiveFrom: "2026-10-20" },
        ],
      }),
    );
    expect(r.lines.find((l) => l.key === "electricity")?.amount).toBe(480_000);
  });

  it("phí theo người đổi giá giữa kỳ thì tách theo ngày", () => {
    const r = computeInvoice(
      base({
        feeRules: [
          { ...water, effectiveTo: "2026-10-15" },
          { ...water, id: "fr-w2", unitPrice: 124_000, effectiveFrom: "2026-10-16" },
        ],
      }),
    );
    const w = r.lines.filter((l) => l.key === "water").map((l) => l.amount);
    // 200.000 × 15/31 = 96.774,19 ; 248.000 × 16/31 = 128.000
    expect(w).toEqual([96_774, 128_000]);
  });
});

describe("computeInvoice — giá bậc thang", () => {
  it("tính lũy tiến theo bậc", () => {
    const tiered: FeeRule = {
      ...electricity,
      tiers: [
        { upToCenti: 5_000, unitPrice: 2_000 },
        { upToCenti: 10_000, unitPrice: 2_500 },
        { upToCenti: null, unitPrice: 3_000 },
      ],
    };
    const r = computeInvoice(base({ feeRules: [tiered] }));
    // 120 kWh: 50×2.000 + 50×2.500 + 20×3.000 = 100.000 + 125.000 + 60.000
    expect(r.lines.find((l) => l.key === "electricity")?.amount).toBe(285_000);
  });

  it("vượt bậc cuối có giới hạn thì dùng giá bậc cuối", () => {
    const tiered: FeeRule = {
      ...electricity,
      tiers: [
        { upToCenti: 5_000, unitPrice: 2_000 },
        { upToCenti: 10_000, unitPrice: 2_500 },
      ],
    };
    const r = computeInvoice(base({ feeRules: [tiered] }));
    expect(r.lines.find((l) => l.key === "electricity")?.amount).toBe(100_000 + 125_000 + 50_000);
  });
});

describe("computeInvoice — lỗi chặn chốt", () => {
  it("thiếu chỉ số cuối kỳ", () => {
    const r = computeInvoice(base({ readings: [{ meterId: "m-e", date: "2026-09-30", valueCenti: 1 }] }));
    expect(r.errors.map((e) => e.code)).toEqual(["missing_reading_end"]);
    expect(r.lines.find((l) => l.key === "electricity")).toBeUndefined();
  });

  it("chỉ số quá xa mốc (ngoài ±3 ngày) coi như thiếu", () => {
    const r = computeInvoice(
      base({
        readings: [
          { meterId: "m-e", date: "2026-09-25", valueCenti: 100_000 },
          { meterId: "m-e", date: "2026-10-31", valueCenti: 110_000 },
        ],
      }),
    );
    expect(r.errors.map((e) => e.code)).toEqual(["missing_reading_start"]);
  });

  it("chỉ số giảm", () => {
    const r = computeInvoice(
      base({
        readings: [
          { meterId: "m-e", date: "2026-09-30", valueCenti: 100_000 },
          { meterId: "m-e", date: "2026-10-31", valueCenti: 90_000 },
        ],
      }),
    );
    expect(r.errors.map((e) => e.code)).toEqual(["reading_decreased"]);
  });

  it("không có giá thuê", () => {
    const input = base();
    input.lease.rents = [];
    expect(computeInvoice(input).errors.map((e) => e.code)).toEqual(["no_rent"]);
  });

  it("tiền không phải số nguyên thì ném lỗi", () => {
    expect(() => computeInvoice(base({ feeRules: [{ ...internet, unitPrice: 100.5 }] }))).toThrow();
  });
});

describe("computeInvoice — làm tròn tổng", () => {
  it("thêm dòng làm tròn minh bạch", () => {
    const input = base({ roundTotalTo: 1_000 });
    input.lease.start = "2026-10-15";
    input.readings = [
      { meterId: "m-e", date: "2026-10-15", valueCenti: 200_000 },
      { meterId: "m-e", date: "2026-10-31", valueCenti: 205_000 },
    ];
    const r = computeInvoice(input);
    // 1.645.161 + 175.000 + 109.677 + 100.000 + 27.419 = 2.057.257
    expect(r.subtotal).toBe(2_057_257);
    expect(r.total).toBe(2_057_000);
    const rounding = r.lines.find((l) => l.kind === "rounding");
    expect(rounding?.amount).toBe(-257);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(r.total);
  });
});
