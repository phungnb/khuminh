"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** Đăng ký service worker và gợi ý thêm app vào màn hình chính. */
export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("km_install_dismissed") === "1";
    } catch {}
    if (standalone || dismissed) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setHidden(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden || (!prompt && !ios)) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem("km_install_dismissed", "1");
    } catch {}
  };
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-brand-strong/30 bg-surface-2 p-3 text-sm">
      <div className="flex-1">
        <p className="font-semibold">Thêm KhuMình vào màn hình chính</p>
        {ios ? (
          <p className="text-fg-muted">Trên iPhone: bấm nút Chia sẻ của Safari, chọn &quot;Thêm vào MH chính&quot;.</p>
        ) : (
          <p className="text-fg-muted">Mở như một app, không cần vào trình duyệt.</p>
        )}
        {prompt ? (
          <button
            className="btn mt-2"
            onClick={async () => {
              await prompt.prompt();
              close();
            }}
          >
            Cài app
          </button>
        ) : null}
      </div>
      <button className="text-fg-subtle" aria-label="Đóng" onClick={close}>
        ✕
      </button>
    </div>
  );
}
