"use client";

import { useState } from "react";
import SubmitButton from "@/components/submit-button";

/** Câu hỏi nhanh khi quan tâm (một bộ cố định cho mọi danh mục, tránh tin nhắn rác). */
const QUICK_QUESTIONS = ["Còn không?", "Có ship trong khu không?", "Có bớt không?", "Tình trạng thực tế ra sao?"];

/**
 * Form quan tâm kèm câu hỏi nhanh + trả giá riêng tư. Chip chỉ điền vào ô lời nhắn,
 * giá đề xuất chỉ người đăng tin thấy trong lượt quan tâm (không đấu giá công khai).
 */
export function InterestForm({ action, listingId }: { action: (f: FormData) => void; listingId: string }) {
  const [note, setNote] = useState("");
  const addQuestion = (q: string) => setNote((n) => (n.trim() ? `${n.trim()} ${q}` : q));
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="listingId" value={listingId} />
      <h2 className="font-semibold">Tôi quan tâm</h2>
      <div>
        <label className="label" htmlFor="contact">SĐT / Zalo của bạn</label>
        <input className="input" id="contact" name="contact" required placeholder="0901 234 567" />
      </div>
      <div>
        <span className="label">Câu hỏi nhanh</span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} type="button" onClick={() => addQuestion(q)} className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm">
              {q}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Lời nhắn</label>
        <input
          className="input"
          id="note"
          name="note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Còn không bạn? Tối nay mình qua xem."
        />
      </div>
      <div>
        <label className="label" htmlFor="offer">Trả giá (không bắt buộc, chỉ người đăng thấy)</label>
        <input className="input" id="offer" name="offer" inputMode="numeric" placeholder="VD: 120000" />
      </div>
      <SubmitButton className="btn w-full">Gửi quan tâm</SubmitButton>
      <p className="text-xs text-fg-subtle">Người đăng đồng ý thì hai bên thấy liên hệ của nhau.</p>
    </form>
  );
}
