"use server";

import { runAction } from "@/lib/action";
import { setSession } from "@/lib/session";
import { createSession } from "@/server/auth";
import { acceptTenantInvite } from "@/server/tenant";

export async function acceptInviteAction(f: FormData) {
  const token = String(f.get("token") ?? "");
  await runAction(`/moi/${token}`, async () => {
    const userId = await acceptTenantInvite(token, {
      phone: String(f.get("phone") ?? ""),
      password: String(f.get("password") ?? ""),
    });
    await setSession(await createSession(userId));
    return "/app";
  }, "Xong. Thêm app vào màn hình chính để mở nhanh.");
}
