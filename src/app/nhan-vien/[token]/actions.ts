"use server";

import { runAction } from "@/lib/action";
import { setSession } from "@/lib/session";
import { createSession } from "@/server/auth";
import { acceptStaffInvite } from "@/server/staff";

export async function acceptStaffInviteAction(f: FormData) {
  const token = String(f.get("token") ?? "");
  await runAction(`/nhan-vien/${token}`, async () => {
    const userId = await acceptStaffInvite(token, {
      email: String(f.get("email") ?? ""),
      password: String(f.get("password") ?? ""),
      displayName: String(f.get("displayName") ?? ""),
    });
    await setSession(await createSession(userId));
    return "/";
  });
}
