"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Chia sẻ link tin (Zalo/Messenger qua bảng chia sẻ của máy, hoặc sao chép link). */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href.split("?")[0]!;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button type="button" onClick={share} aria-label="Chia sẻ tin" className="grid size-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur">
      {copied ? <Check className="size-5" aria-hidden /> : <Share2 className="size-5" aria-hidden />}
    </button>
  );
}
