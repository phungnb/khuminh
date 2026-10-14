// Trang "Hôm nay": chỉ chọn và sắp xếp dữ liệu đã có (hóa đơn, sự cố, thông báo khu).
// Không tạo nội dung, không tính tiền mới: số còn phải trả = tổng − đã trả như trang Nhà và nơi ở.

import type { PostRow } from "./board";
import type { MaintenanceRow } from "./maintenance";
import type { TenantHome, TenantInvoiceRow } from "./tenant";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sự cố đã xong/từ chối vẫn hiện thêm vài ngày để người thuê biết kết quả. */
export const RESOLVED_SHOW_DAYS = 3;
/** Thông báo của chủ trọ cũ hơn mức này không còn đứng ở trang Hôm nay. */
export const ANNOUNCEMENT_SHOW_DAYS = 14;

export interface DueInvoice {
  propertyName: string;
  unitCode: string;
  invoice: TenantInvoiceRow;
  owed: number;
}

/** Hóa đơn còn phải trả của các phòng đang thuê; quá hạn trước, rồi hạn gần nhất. */
export function dueInvoices(homes: TenantHome[]): DueInvoice[] {
  const out: DueInvoice[] = [];
  for (const h of homes) {
    if (!h.active) continue;
    for (const i of h.invoices) {
      if (i.state !== "unpaid" && i.state !== "partial" && i.state !== "overdue") continue;
      out.push({ propertyName: h.propertyName, unitCode: h.unitCode, invoice: i, owed: i.total - i.paid });
    }
  }
  return out.sort(
    (a, b) =>
      Number(b.invoice.state === "overdue") - Number(a.invoice.state === "overdue") ||
      a.invoice.dueDate.localeCompare(b.invoice.dueDate),
  );
}

/** Sự cố còn mở, và sự cố vừa có kết quả trong RESOLVED_SHOW_DAYS ngày. Gấp và còn mở lên trước. */
export function incidentsToShow(requests: MaintenanceRow[], now: Date): MaintenanceRow[] {
  const since = now.getTime() - RESOLVED_SHOW_DAYS * DAY_MS;
  const open = (r: MaintenanceRow) => r.status === "open" || r.status === "in_progress";
  return requests
    .filter((r) => open(r) || (r.resolvedAt !== null && r.resolvedAt.getTime() >= since))
    .sort(
      (a, b) =>
        Number(open(b)) - Number(open(a)) ||
        Number(b.urgent) - Number(a.urgent) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
}

/** Thông báo của chủ trọ/nhân viên còn hiệu lực, mới nhất trước. */
export function freshAnnouncements(posts: PostRow[], now: Date): PostRow[] {
  const since = now.getTime() - ANNOUNCEMENT_SHOW_DAYS * DAY_MS;
  return posts
    .filter((p) => p.kind === "announcement" && p.fromManager && !p.closed && !p.hidden && p.createdAt.getTime() >= since)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
