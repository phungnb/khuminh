// Xuất hóa đơn một kỳ ra Excel (.xlsx) cho chủ trọ đối chiếu, lưu sổ.

import ExcelJS from "exceljs";
import { and, asc, eq, inArray } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { billingPeriods, invoiceLines, invoices } from "@/db/schema";
import { PAYMENT_STATE_LABEL } from "@/domain/payments";
import type { Actor } from "./audit";
import { getProperty, invoicesForPeriod } from "./queries";

const MONEY = '#,##0" đ"';

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** null nếu kỳ không thuộc cơ sở hoặc người dùng không có quyền với cơ sở. */
export async function exportPeriodXlsx(
  actor: Actor,
  propertyId: string,
  periodId: string,
): Promise<{ filename: string; data: Buffer } | null> {
  const property = await getProperty(actor, propertyId);
  if (!property) return null;
  const [period] = await withOrg(actor, (tx) =>
    tx.select().from(billingPeriods).where(and(eq(billingPeriods.id, periodId), eq(billingPeriods.propertyId, propertyId))),
  );
  if (!period) return null;
  const rows = (await invoicesForPeriod(actor, periodId)).filter((r) => r.status !== "draft");
  const lines = rows.length
    ? await withOrg(actor, (tx) =>
        tx
          .select({ invoiceId: invoiceLines.invoiceId, description: invoiceLines.description, amount: invoiceLines.amount })
          .from(invoiceLines)
          .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
          .where(inArray(invoiceLines.invoiceId, rows.map((r) => r.id)))
          .orderBy(asc(invoices.code), asc(invoiceLines.position)),
      )
    : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "KhuMình";
  const label = `${dmy(period.periodStart)} - ${dmy(period.periodEnd)}`;

  const ws = wb.addWorksheet("Hóa đơn");
  ws.addRow([`${property.name} · kỳ ${label}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const header = ws.addRow(["Phòng", "Người thuê", "SĐT", "Mã hóa đơn", "Trạng thái", "Tổng", "Đã trả", "Còn nợ", "Hạn trả"]);
  header.font = { bold: true };
  const first = ws.rowCount + 1;
  for (const r of rows) {
    const live = r.status === "issued";
    ws.addRow([
      r.unitCode,
      r.tenantName,
      r.phone ?? "",
      r.code,
      PAYMENT_STATE_LABEL[r.state],
      live ? r.total : 0,
      live ? r.paid : 0,
      live ? r.total - r.paid : 0,
      dmy(r.dueDate),
    ]);
  }
  const last = ws.rowCount;
  if (rows.length) {
    // Ghi sẵn kết quả để ứng dụng xem trước (Zalo, Google Drive) cũng thấy số tổng.
    const sum = (col: string, idx: number) => ({
      formula: `SUM(${col}${first}:${col}${last})`,
      result: ws.getColumn(idx).values.slice(first).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0),
    });
    const total = ws.addRow(["Tổng", "", "", "", "", sum("F", 6), sum("G", 7), sum("H", 8), ""]);
    total.font = { bold: true };
  }
  ws.columns.forEach((c, i) => {
    c.width = [10, 24, 13, 16, 14, 15, 15, 15, 12][i];
    if (i >= 5 && i <= 7) c.numFmt = MONEY;
  });

  const detail = wb.addWorksheet("Chi tiết");
  detail.addRow(["Phòng", "Mã hóa đơn", "Khoản", "Số tiền"]).font = { bold: true };
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const l of lines) {
    const r = byId.get(l.invoiceId)!;
    detail.addRow([r.unitCode, r.code, l.description, l.amount]);
  }
  detail.columns.forEach((c, i) => {
    c.width = [10, 16, 50, 15][i];
    if (i === 3) c.numFmt = MONEY;
  });

  const data = Buffer.from(await wb.xlsx.writeBuffer());
  return { filename: `hoa-don-${period.periodStart.slice(0, 7)}.xlsx`, data };
}
