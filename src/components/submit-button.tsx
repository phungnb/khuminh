// Nút gửi form: đang chạy thì hiện vòng xoay chờ và khóa nút, tránh bấm 2 lần.
// Dùng useFormStatus nên chỉ có tác dụng khi nằm trong <form action={server action}>;
// ngoài form thì hoạt động như nút gửi thường.
"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export default function SubmitButton({
  children,
  className = "btn",
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const locked = disabled || pending;
  return (
    <button type="submit" className={className} disabled={locked} aria-disabled={locked} name={name} value={value}>
      {pending ? (
        <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
