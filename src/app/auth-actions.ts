"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, setSession } from "@/lib/session";
import { runAction } from "@/lib/action";
import { signIn, signOut, signUpOwner } from "@/server/auth";
import { UserError } from "@/server/audit";

export async function loginAction(form: FormData) {
  await runAction("/dang-nhap", async () => {
    const res = await signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
    if (!res) throw new UserError("Thông tin đăng nhập hoặc mật khẩu không đúng");
    await setSession(res.token);
    return "/";
  });
}

export async function signupAction(form: FormData) {
  await runAction("/dang-ky", async () => {
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    await signUpOwner({
      email,
      password,
      displayName: String(form.get("displayName") ?? ""),
      orgName: String(form.get("orgName") ?? ""),
    });
    const res = await signIn(email, password);
    await setSession(res!.token);
    return "/co-so/moi";
  });
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await signOut(token);
  jar.delete(SESSION_COOKIE);
  redirect("/dang-nhap");
}
