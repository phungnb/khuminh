import { describe, expect, it } from "vitest";
import type { PostRow } from "./board";
import type { MaintenanceRow } from "./maintenance";
import type { TenantHome, TenantInvoiceRow } from "./tenant";
import { dueInvoices, freshAnnouncements, incidentsToShow } from "./today";

const now = new Date("2026-10-14T03:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

function inv(id: string, state: TenantInvoiceRow["state"], dueDate: string, total = 3_000_000, paid = 0): TenantInvoiceRow {
  return { id, code: id, dueDate, total, paid, state, periodLabel: "10/2026" };
}

function home(active: boolean, invoices: TenantInvoiceRow[]): TenantHome {
  return { orgId: "o", propertyId: "p", propertyName: "Nhà A", unitCode: "101", active, invoices };
}

function req(id: string, status: MaintenanceRow["status"], o: Partial<MaintenanceRow> = {}): MaintenanceRow {
  return {
    id,
    propertyId: "p",
    propertyName: "Nhà A",
    unitCode: "101",
    title: id,
    body: null,
    urgent: false,
    status,
    resolutionNote: null,
    createdByName: "B",
    createdAt: daysAgo(5),
    resolvedAt: null,
    ...o,
  };
}

function post(id: string, o: Partial<PostRow> = {}): PostRow {
  return {
    id,
    kind: "announcement",
    title: id,
    body: null,
    price: null,
    authorName: "Chủ trọ",
    fromManager: true,
    mine: false,
    closed: false,
    hidden: false,
    createdAt: daysAgo(1),
    ...o,
  };
}

describe("Hôm nay: hóa đơn cần trả", () => {
  it("chỉ lấy hóa đơn còn nợ của phòng đang thuê, quá hạn lên đầu rồi hạn gần nhất", () => {
    const homes = [
      home(true, [
        inv("paid", "paid", "2026-09-05"),
        inv("later", "unpaid", "2026-10-20"),
        inv("partial", "partial", "2026-10-10", 3_000_000, 1_000_000),
        inv("overdue", "overdue", "2026-09-30"),
      ]),
      home(false, [inv("old", "overdue", "2026-01-05")]),
    ];
    const out = dueInvoices(homes);
    expect(out.map((d) => d.invoice.id)).toEqual(["overdue", "partial", "later"]);
    expect(out.find((d) => d.invoice.id === "partial")!.owed).toBe(2_000_000);
  });

  it("không có gì thì trả rỗng", () => {
    expect(dueInvoices([])).toEqual([]);
  });
});

describe("Hôm nay: sự cố", () => {
  it("giữ sự cố còn mở và sự cố vừa có kết quả trong 3 ngày; gấp lên trước", () => {
    const out = incidentsToShow(
      [
        req("cu-xong", "done", { resolvedAt: daysAgo(4) }),
        req("vua-xong", "done", { resolvedAt: daysAgo(1) }),
        req("mo", "open", { createdAt: daysAgo(1) }),
        req("gap", "in_progress", { urgent: true, createdAt: daysAgo(2) }),
        req("tu-choi", "rejected", { resolvedAt: daysAgo(2) }),
      ],
      now,
    );
    expect(out.map((r) => r.id)).toEqual(["gap", "mo", "vua-xong", "tu-choi"]);
  });
});

describe("Hôm nay: thông báo khu", () => {
  it("chỉ thông báo của chủ trọ, chưa đóng/ẩn, trong 14 ngày, mới nhất trước", () => {
    const out = freshAnnouncements(
      [
        post("cu", { createdAt: daysAgo(15) }),
        post("moi", { createdAt: daysAgo(0) }),
        post("hom-qua"),
        post("rao-vat", { kind: "sell", fromManager: false }),
        post("da-dong", { closed: true }),
        post("bi-an", { hidden: true }),
      ],
      now,
    );
    expect(out.map((p) => p.id)).toEqual(["moi", "hom-qua"]);
  });
});
