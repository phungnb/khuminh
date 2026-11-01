// Nút nguy hiểm 2 bước cho người dùng non-tech: bấm lần 1 chỉ hiện hộp
// xác nhận ngay tại chỗ (tiêu đề + hậu quả + 2 nút), bấm lần 2 mới gửi
// form thật. Không dùng window.confirm (khó đọc trên điện thoại, nút
// OK/Hủy của trình duyệt không nói rõ hậu quả).
// Dùng trong <form action={server action}>: nút xác nhận là SubmitButton
// nên vẫn gửi đúng form kèm các ô nhập cùng form (lý do hủy, ngày...),
// còn nút "Thôi, để lại" là type="button" nên không gửi gì cả.
// Ngoài form thì nút xác nhận hoạt động như nút gửi thường (như SubmitButton).
"use client";

import { useState, type ReactNode } from "react";
import SubmitButton from "./submit-button";

export default function ConfirmButton({
  children,
  className = "btn-danger",
  title,
  message,
  confirmLabel = "Đồng ý, làm luôn",
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  message?: string;
  confirmLabel?: string;
  name?: string;
  value?: string;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-3">
      <p className="text-sm font-semibold">{title}</p>
      {message ? <p className="text-sm text-fg-muted">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton className={className} name={name} value={value}>
          {confirmLabel}
        </SubmitButton>
        <button type="button" className="btn-secondary" onClick={() => setArmed(false)}>
          Thôi, để lại
        </button>
      </div>
    </div>
  );
}
