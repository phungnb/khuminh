"use client";

import { useEffect, useState } from "react";
import { removePushAction, savePushAction } from "@/app/app/actions";

function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "ios-install" | "off" | "on" | "denied";

/** Bật/tắt thông báo hóa đơn mới và thông báo của chủ trọ trên thiết bị này. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
      const json = sub.toJSON();
      await savePushAction({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
      setState("on");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "off");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
      <div>
        <p className="font-semibold">Thông báo</p>
        <p className="text-fg-muted">
          {state === "on"
            ? "Đang bật: báo khi có hóa đơn mới và thông báo của chủ trọ."
            : state === "denied"
              ? "Bạn đã chặn thông báo. Mở cài đặt trình duyệt để cho phép lại."
              : state === "ios-install"
                ? "Trên iPhone, thêm app vào màn hình chính rồi mở từ đó để bật thông báo."
                : "Nhận báo khi có hóa đơn mới, cúp điện nước..."}
        </p>
      </div>
      {state === "off" ? (
        <button className="btn shrink-0" disabled={busy} onClick={turnOn}>
          Bật
        </button>
      ) : state === "on" ? (
        <button className="btn-secondary shrink-0" disabled={busy} onClick={turnOff}>
          Tắt
        </button>
      ) : null}
    </div>
  );
}
