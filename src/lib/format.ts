export function vnd(n: number): string {
  return `${n.toLocaleString("vi-VN")}đ`;
}

export function dmy(d: string | null | undefined): string {
  if (!d) return "";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

/** Đọc số tiền người dùng gõ: "3.500.000", "3500000", "3,5tr" không hỗ trợ. */
export function parseMoney(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").replace(/[.\s,đ]/g, "");
  if (!/^-?\d+$/.test(s)) return Number.NaN;
  return Number(s);
}

export function parseIntField(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** Số chỉ số đồng hồ, chấp nhận dấu phẩy thập phân. */
export function parseReading(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Number(s);
}
