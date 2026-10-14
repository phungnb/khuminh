"use server";

import { runAction } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { setListingHidden, setUserLocked } from "@/server/admin";
import { UserError } from "@/server/audit";

// Quyền admin do hàm SQL tự kiểm (assert_platform_admin); ở đây chỉ đọc form.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function uuid(f: FormData, k: string): string {
  const v = str(f, k);
  if (!UUID.test(v)) throw new UserError("Mã không hợp lệ");
  return v;
}

export async function setListingHiddenAction(f: FormData) {
  const user = await requireUser();
  const hidden = str(f, "hidden") === "1";
  await runAction("/admin", () => setListingHidden(user.id, uuid(f, "listingId"), hidden, str(f, "reason").slice(0, 300)), hidden ? "Đã ẩn tin" : "Đã hiện lại tin");
}

export async function setUserLockedAction(f: FormData) {
  const user = await requireUser();
  const locked = str(f, "locked") === "1";
  await runAction(
    "/admin",
    () => setUserLocked(user.id, uuid(f, "userId"), locked, str(f, "reason").slice(0, 300)),
    locked ? "Đã khóa tài khoản, đăng xuất mọi thiết bị và ẩn tin đang mở" : "Đã mở khóa tài khoản",
  );
}
