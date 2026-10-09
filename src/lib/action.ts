import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ForbiddenError, UserError } from "@/server/audit";

/**
 * Chạy thao tác của form. Lỗi nghiệp vụ được đưa về trang `back` qua ?loi=...;
 * thành công thì chuyển tới `next` (mặc định `back`) kèm ?ok=... nếu có.
 */
export async function runAction(back: string, fn: () => Promise<string | void>, ok?: string): Promise<never> {
  let target: string;
  try {
    const next = await fn();
    target = next && /[?&](ok|loi)=/.test(next) ? next : withParam(next || back, "ok", ok);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof UserError || e instanceof ForbiddenError) {
      target = withParam(back, "loi", e.message);
    } else if (e instanceof Error && /không hợp lệ|phải là số nguyên/.test(e.message)) {
      target = withParam(back, "loi", e.message);
    } else {
      console.error(e);
      target = withParam(back, "loi", "Có lỗi hệ thống, vui lòng thử lại");
    }
  }
  redirect(target);
}

function withParam(url: string, key: string, value?: string): string {
  if (!value) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}
