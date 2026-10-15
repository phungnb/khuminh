import { describe, expect, it } from "vitest";
import { actionItems, emptyMoney, previousMonth, sumTotals, type PropertySummary } from "./overview-items";

const vnd = (n: number) => `${n}đ`;

function prop(over: Partial<PropertySummary> = {}): PropertySummary {
  return {
    id: "p1",
    name: "Dãy 1",
    money: emptyMoney(),
    units: { total: 0, occupied: 0, vacant: 0, maintenance: 0 },
    periodGaps: [],
    missingPeriodFor: null,
    leasesDue: [],
    openIssues: 0,
    ...over,
  };
}

describe("previousMonth", () => {
  it("qua năm và tháng 2", () => {
    expect(previousMonth("2026-01-10")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(previousMonth("2028-03-01")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("sumTotals", () => {
  it("cộng các cơ sở, lấp đầy bỏ phòng bảo trì", () => {
    const t = sumTotals([
      prop({ money: { receivable: 100, collected: 40, overdue: 10, unpaidCount: 2, overdueCount: 1 }, units: { total: 4, occupied: 3, vacant: 0, maintenance: 1 } }),
      prop({ id: "p2", money: { receivable: 50, collected: 50, overdue: 0, unpaidCount: 0, overdueCount: 0 }, units: { total: 2, occupied: 0, vacant: 2, maintenance: 0 } }),
    ]);
    expect(t.money).toEqual({ receivable: 150, collected: 90, overdue: 10, unpaidCount: 2, overdueCount: 1, outstanding: 60 });
    expect(t.occupancy).toBe(60);
    expect(sumTotals([]).occupancy).toBeNull();
  });
});

describe("actionItems", () => {
  it("không có việc thì rỗng", () => {
    expect(actionItems([prop()], "2026-10-15", vnd)).toEqual([]);
  });

  it("thứ tự: tiền trước, rồi kỳ, hợp đồng, sự cố; quá hạn tô đỏ", () => {
    const items = actionItems(
      [
        prop({
          money: { receivable: 300, collected: 100, overdue: 150, unpaidCount: 2, overdueCount: 1 },
          openIssues: 2,
          leasesDue: [
            { unitId: "u1", unitCode: "101", tenantName: "Bình", expiresOn: "2026-11-01" },
            { unitId: "u2", unitCode: "102", tenantName: "Chi", expiresOn: "2026-10-01" },
            { unitId: "u3", unitCode: "103", tenantName: "Dũng", expiresOn: "2027-01-01" },
          ],
          periodGaps: [{ periodId: "k1", periodStart: "2026-09-01", periodEnd: "2026-09-30", missingUnits: ["101", "102"], drafts: 1 }],
          missingPeriodFor: { start: "2026-09-01", end: "2026-09-30" },
        }),
      ],
      "2026-10-15",
      vnd,
    );
    expect(items.map((i) => i.kind)).toEqual(["unpaid", "missing_period", "period_gap", "lease_expired", "issues", "lease_expiring"]);
    expect(items[0]).toMatchObject({ title: "2 hóa đơn chưa thu đủ · 200đ", tone: "danger", href: "/co-so/p1/ky" });
    expect(items[1]!.title).toBe("Chưa mở kỳ tháng 09/2026");
    expect(items[2]).toMatchObject({
      title: "Kỳ 01/09/2026 – 30/09/2026: 2 phòng chưa lập hóa đơn, 1 hóa đơn nháp chưa phát hành",
      detail: "101, 102",
      href: "/co-so/p1/ky/k1",
    });
    expect(items[3]).toMatchObject({ title: "Hợp đồng phòng 102 đã hết hạn", href: "/co-so/p1/phong/u2" });
    // 103 hết hạn sau 30 ngày: không nhắc.
    expect(items.filter((i) => i.kind === "lease_expiring")).toHaveLength(1);
  });

  it("nhiều phòng thì rút gọn danh sách mã", () => {
    const missing = Array.from({ length: 10 }, (_, i) => `P${i}`);
    const [item] = actionItems(
      [prop({ periodGaps: [{ periodId: "k", periodStart: "2026-09-01", periodEnd: "2026-09-30", missingUnits: missing, drafts: 0 }] })],
      "2026-10-15",
      vnd,
    );
    expect(item!.detail).toBe("P0, P1, P2, P3, P4, P5, P6, P7 và 2 phòng khác");
  });
});
