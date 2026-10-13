"use client";

import { useEffect, useState } from "react";

export interface ReadingRow {
  meterId: string;
  unitCode: string;
  name: string;
  last: { date: string; value: number } | null;
  onDate: number | null;
}

/**
 * Ô nhập chỉ số cho từng đồng hồ. Hiện lượng tiêu thụ ngay khi gõ, cảnh báo chỉ số giảm.
 * Giá trị đang gõ được lưu tạm trên máy (localStorage) để mất mạng không mất số.
 */
export function ReadingInputs({ rows, storageKey }: { rows: ReadingRow[]; storageKey: string }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.meterId, r.onDate === null ? "" : String(r.onDate)])),
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, string>;
      setValues((v) => {
        const merged = { ...v };
        for (const [k, val] of Object.entries(saved)) if (!merged[k]) merged[k] = val;
        return merged;
      });
    } catch {
      /* bộ nhớ trình duyệt không dùng được: bỏ qua */
    }
  }, [storageKey]);

  function update(id: string, val: string) {
    setValues((v) => {
      const next = { ...v, [id]: val };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* bỏ qua */
      }
      return next;
    });
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map((r) => {
        const raw = values[r.meterId] ?? "";
        const n = Number(raw.replace(",", "."));
        const used = raw && r.last && Number.isFinite(n) ? Math.round((n - r.last.value) * 100) / 100 : null;
        return (
          <div key={r.meterId} className="flex items-center gap-3 py-2">
            <div className="w-24 shrink-0">
              <div className="font-semibold">{r.unitCode}</div>
              <div className="text-xs text-fg-subtle">{r.name}</div>
            </div>
            <div className="w-28 shrink-0 text-xs text-fg-subtle">
              {r.last ? (
                <>
                  Trước: <b className="text-fg">{r.last.value.toLocaleString("vi-VN")}</b>
                  <br />
                  {r.last.date.slice(8, 10)}/{r.last.date.slice(5, 7)}
                </>
              ) : (
                "Chưa có số cũ"
              )}
            </div>
            <div className="flex-1">
              <input
                className="input"
                name={`m_${r.meterId}`}
                inputMode="decimal"
                value={raw}
                onChange={(e) => update(r.meterId, e.target.value)}
                aria-label={`Chỉ số ${r.name} phòng ${r.unitCode}`}
              />
              {used !== null ? (
                <div className={`mt-1 text-xs ${used < 0 ? "font-semibold text-red-700" : "text-fg-muted"}`}>
                  {used < 0 ? `Chỉ số giảm ${used.toLocaleString("vi-VN")}. Kiểm tra lại.` : `Dùng ${used.toLocaleString("vi-VN")}`}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClearDraft({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* bỏ qua */
    }
  }, [storageKey]);
  return null;
}
