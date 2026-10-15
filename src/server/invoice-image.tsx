// Hóa đơn dạng ảnh PNG để chủ trọ gửi qua Zalo. Chỉ vẽ lại PublicInvoice (cùng dữ liệu trang /hd), không tính tiền.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { COMMON_BANKS } from "@/domain/vietqr";
import { dmy, vnd } from "@/lib/format";
import type { PublicInvoice } from "./share";

const WIDTH = 720;
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

let fonts: Promise<Array<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }>> | null = null;
export function loadFonts() {
  fonts ??= Promise.all([
    readFile(path.join(FONT_DIR, "BeVietnamPro-Regular.ttf")).then((data) => ({ name: "Be Vietnam Pro", data, weight: 400 as const, style: "normal" as const })),
    readFile(path.join(FONT_DIR, "BeVietnamPro-Bold.ttf")).then((data) => ({ name: "Be Vietnam Pro", data, weight: 700 as const, style: "normal" as const })),
  ]);
  return fonts;
}

export const INK = "#0f172a";
export const MUTED = "#64748b";
const LINE = "#e2e8f0";
export const BRAND = "#b6ff3b";
export const BRAND_INK = "#1f3d00";

export function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: `1px solid ${LINE}`, fontWeight: bold ? 700 : 400, color: color ?? INK }}>
      <div style={{ display: "flex", maxWidth: 470 }}>{label}</div>
      <div style={{ display: "flex" }}>{value}</div>
    </div>
  );
}

/** Ảnh hóa đơn. `link` (nếu có) là địa chỉ bản mới nhất, in ở chân ảnh vì ảnh không tự cập nhật. */
export async function invoiceImage(inv: PublicInvoice, link: string | null): Promise<ImageResponse> {
  const due = Math.max(0, inv.total - inv.paid);
  const qr = inv.qrPayload ? await QRCode.toDataURL(inv.qrPayload, { margin: 1, width: 240 }) : null;
  const bankName = inv.bank ? (COMMON_BANKS.find((b) => b.bin === inv.bank!.bankBin)?.name ?? inv.bank.bankBin) : null;
  const rows = inv.lines.length + inv.adjustments.length + (inv.paid > 0 ? 3 : 2);
  const height = 330 + rows * 50 + (qr && inv.bank ? 300 : 0) + (inv.status === "void" || due === 0 ? 70 : 0) + (link ? 60 : 0) + 30;
  const month = `${inv.periodStart.slice(5, 7)}/${inv.periodStart.slice(0, 4)}`;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#ffffff", fontFamily: "Be Vietnam Pro", fontSize: 24, color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", background: BRAND, color: BRAND_INK, padding: "28px 40px" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>THÔNG BÁO TIỀN PHÒNG THÁNG {month}</div>
          <div style={{ display: "flex", marginTop: 6 }}>
            {inv.propertyName} · Phòng {inv.unitCode}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "20px 40px 0" }}>
          <div style={{ display: "flex", color: MUTED, fontSize: 20 }}>
            Kỳ {dmy(inv.periodStart)} – {dmy(inv.periodEnd)} · Mã {inv.code} · Hạn trả {dmy(inv.dueDate)}
          </div>
          {inv.status === "void" ? (
            <div style={{ display: "flex", marginTop: 16, padding: 14, background: "#f1f5f9", borderRadius: 12 }}>
              Hóa đơn này đã bị hủy. Chủ nhà sẽ gửi hóa đơn mới.
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
            {inv.lines.map((l, i) => (
              <Row key={`l${i}`} label={l.description} value={vnd(l.amount)} />
            ))}
            {inv.adjustments.map((a, i) => (
              <Row key={`a${i}`} label={`Điều chỉnh: ${a.reason}`} value={vnd(a.amount)} />
            ))}
            <Row label="Tổng" value={vnd(inv.total)} bold />
            {inv.paid > 0 ? <Row label="Đã trả" value={`−${vnd(inv.paid)}`} color="#15803d" /> : null}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", fontSize: 30, fontWeight: 700 }}>
              <div style={{ display: "flex" }}>Còn phải trả</div>
              <div style={{ display: "flex", color: due > 0 ? "#b91c1c" : "#15803d" }}>{vnd(due)}</div>
            </div>
          </div>
          {due === 0 && inv.status === "issued" ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 14, background: "#dcfce7", color: "#15803d", borderRadius: 12, fontWeight: 700 }}>
              Đã thanh toán đủ. Cảm ơn bạn.
            </div>
          ) : null}
          {qr && inv.bank ? (
            <div style={{ display: "flex", gap: 24, alignItems: "center", marginTop: 8, padding: 20, border: `2px solid ${LINE}`, borderRadius: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} width={220} height={220} alt="" />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 22 }}>
                <div style={{ display: "flex", fontWeight: 700 }}>Quét mã để chuyển khoản</div>
                <div style={{ display: "flex" }}>{bankName}</div>
                <div style={{ display: "flex" }}>STK {inv.bank.accountNo}</div>
                {inv.bank.accountName ? <div style={{ display: "flex" }}>{inv.bank.accountName}</div> : null}
                <div style={{ display: "flex" }}>Số tiền {vnd(due)}</div>
                <div style={{ display: "flex" }}>Nội dung {inv.code}</div>
              </div>
            </div>
          ) : null}
          {link ? (
            <div style={{ display: "flex", marginTop: 18, color: MUTED, fontSize: 18 }}>Bản mới nhất: {link}</div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height,
      fonts: await loadFonts(),
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
