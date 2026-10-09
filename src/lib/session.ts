import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorFor, userFromSession } from "@/server/auth";
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
  if (!actor) redirect("/dang-nhap?loi=" + encodeURIComponent("Tài khoản chưa thuộc khu trọ nào"));
  return { ...actor, displayName: user.displayName };
}
