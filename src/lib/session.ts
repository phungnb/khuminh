import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorFor, SESSION_TTL_DAYS, userFromSession } from "@/server/auth";
import type { Actor } from "@/server/audit";

export const SESSION_COOKIE = "km_session";

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromSession(token);
}

/** Người dùng đã đăng nhập và tổ chức của họ; chưa đăng nhập thì chuyển tới trang đăng nhập. */
export async function requireActor(): Promise<Actor & { displayName: string }> {
  const user = await currentUser();
  if (!user) redirect("/dang-nhap");
  const actor = await actorFor(user.id);
  // Người thuê không quản lý khu trọ nào: về app người thuê.
  if (!actor) redirect("/app");
  return { ...actor, displayName: user.displayName };
}

/** Người dùng đã đăng nhập (người thuê); chưa đăng nhập thì về trang đăng nhập. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/dang-nhap");
  return user;
}

export async function setSession(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86_400,
  });
}
