// Phiếu quyết toán trả phòng dạng ảnh PNG để gửi người thuê qua Zalo. Chỉ vẽ lại số đã lưu ở bản quyết toán, không tính tiền.

import { ImageResponse } from "next/og";
import { dmy, vnd } from "@/lib/format";
import type { Settlement, SettlementContext } from "./deposit";
import { BRAND, BRAND_INK, INK, loadFonts, MUTED, Row } from "./invoice-image";

const WIDTH = 720;
const METHOD: Record<string, string> = { cash: "tiền mặt", transfer: "chuyển khoản", other: "khác" };

export async function settlementImage(ctx: SettlementContext, st: Settlement): Promise<ImageResponse> {
  const debtAfter = st.debtBefore + st.fullMonthTopUp + st.deductions.reduce((s, d) => s + d.amount, 0);
  const rows = 3 + (st.fullMonthTopUp > 0 ? 1 : 0) + st.deductions.length + (st.creditApplied > 0 ? 1 : 0);
  const height = 300 + rows * 50 + 90 + (st.refundedOn ? 60 : 0) + (st.depositHeldNote ? 40 : 0) + 30;
  const result =
    st.refundDue > 0
      ? { label: "Chủ nhà hoàn lại bạn", value: st.refundDue, color: "#15803d" }
      : st.tenantOwes > 0
        ? { label: "Bạn cần trả thêm", value: st.tenantOwes, color: "#b91c1c" }
        : null;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#ffffff", fontFamily: "Be Vietnam Pro", fontSize: 24, color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", background: BRAND, color: BRAND_INK, padding: "28px 40px" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>QUYẾT TOÁN TRẢ PHÒNG</div>
          <div style={{ display: "flex", marginTop: 6 }}>
            {ctx.propertyName} · Phòng {ctx.unitCode} · {ctx.tenantName}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "20px 40px 0" }}>
          <div style={{ display: "flex", color: MUTED, fontSize: 20 }}>
            Ở từ {dmy(ctx.startDate)} đến {dmy(ctx.movedOutOn)} · quyết toán {dmy(st.settledOn)} · tháng cuối{" "}
            {st.lastMonthMode === "full_month" ? "tính đủ tháng" : "tính theo ngày ở"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
            <Row label="Tiền cọc đã giữ" value={vnd(st.depositHeld)} />
            <Row label={`Hóa đơn còn nợ (gồm hóa đơn cuối ${ctx.finalInvoice?.code ?? ""})`} value={vnd(st.debtBefore)} />
            {st.fullMonthTopUp > 0 ? <Row label="Bù tiền phòng đủ tháng cuối" value={vnd(st.fullMonthTopUp)} /> : null}
            {st.deductions.map((d, i) => (
              <Row key={i} label={`Khấu trừ: ${d.reason}`} value={vnd(d.amount)} />
            ))}
            <Row label="Tổng phải thanh toán" value={vnd(debtAfter)} bold />
            {st.creditApplied > 0 ? <Row label="Trừ tiền bạn đã trả dư" value={`−${vnd(st.creditApplied)}`} color="#15803d" /> : null}
            <Row label="Trừ vào tiền cọc" value={`−${vnd(st.depositApplied)}`} color="#15803d" />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", fontSize: 30, fontWeight: 700 }}>
              <div style={{ display: "flex" }}>{result?.label ?? "Đã tất toán"}</div>
              <div style={{ display: "flex", color: result?.color ?? "#15803d" }}>{vnd(result?.value ?? 0)}</div>
            </div>
          </div>
          {st.depositHeldNote ? (
            <div style={{ display: "flex", color: MUTED, fontSize: 20 }}>Ghi chú tiền cọc: {st.depositHeldNote}</div>
          ) : null}
          {st.refundedOn ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 14, background: "#dcfce7", color: "#15803d", borderRadius: 12, fontWeight: 700 }}>
              Đã hoàn {vnd(st.refundDue)} ngày {dmy(st.refundedOn)} ({METHOD[st.refundMethod ?? "other"]})
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: WIDTH, height, fonts: await loadFonts(), headers: { "Cache-Control": "private, no-store" } },
  );
}
