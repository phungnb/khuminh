// Các nhu cầu chính quanh khu (góp ý 1.docx): mua bán, cho tặng, sửa chữa, dọn dẹp/giặt ủi.
// Mỗi nhu cầu là một cặp loại tin + danh mục có sẵn, không thêm dữ liệu mới.

import type { ListingKind } from "@/server/market";

export interface Purpose {
  key: string;
  label: string;
  hint: string;
  kind: ListingKind;
  category?: string;
}

export const PURPOSES: Purpose[] = [
  { key: "mua-ban", label: "Mua bán", hint: "Đồ cũ còn dùng được, đồ tự làm", kind: "sell" },
  { key: "can-mua", label: "Cần mua", hint: "Tìm mua, tìm người làm", kind: "want" },
  { key: "cho-tang", label: "Cho tặng", hint: "Đồ hàng xóm cho lại miễn phí", kind: "give" },
  { key: "sua-chua", label: "Sửa chữa", hint: "Sửa điện nước, đồ gia dụng, xe", kind: "service", category: "Sửa chữa" },
  { key: "don-dep", label: "Dọn dẹp, giặt ủi", hint: "Dọn nhà, giặt sấy, ủi đồ", kind: "service", category: "Dọn dẹp, giặt ủi" },
  { key: "dich-vu", label: "Dịch vụ khác", hint: "Nấu ăn, dạy kèm, giao nhận…", kind: "service" },
];

/** Nhu cầu đang chọn theo bộ lọc loại tin + danh mục; danh mục riêng của nhu cầu thắng. */
export function purposeOf(kind: string | undefined, category: string | undefined): Purpose | undefined {
  if (!kind) return undefined;
  return (
    PURPOSES.find((p) => p.kind === kind && p.category !== undefined && p.category === category) ??
    PURPOSES.find((p) => p.kind === kind && p.category === undefined)
  );
}

/** Tham số tìm/đăng tin của một nhu cầu. */
export function purposeParams(p: Purpose): Record<string, string> {
  return p.category ? { k: p.kind, c: p.category } : { k: p.kind };
}

/** Link đăng tin điền sẵn loại tin và danh mục. */
export function postHref(p: Purpose): string {
  return `/app/dang-tin?${new URLSearchParams(purposeParams(p)).toString()}`;
}
