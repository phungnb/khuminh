// Giới hạn đăng nhập sai chống brute-force: tối đa 5 lần sai / 1 phút / mỗi cặp
// (IP, định danh đăng nhập). Áp dụng cho mọi điểm kiểm tra mật khẩu:
// signIn (chủ trọ email/SĐT), acceptTenantInvite và acceptStaffInvite
// (người thuê/nhân viên đã có tài khoản nhận link mời).
//
// Storage: Map trong bộ nhớ tiến trình (không cần thêm dịch vụ ngoài).
// HẠN CHẾ ĐÃ BIẾT: mỗi serverless instance có bộ nhớ riêng nên giới hạn áp dụng
// theo từng instance, kẻ tấn công có thể "chia" số lần thử qua nhiều instance.
// Đủ giảm phần lớn brute-force cho đợt này; muốn chặn tuyệt đối phải dùng
// storage chia sẻ (Redis/Upstash — cần key dịch vụ ngoài, để giai đoạn sau).

import { UserError } from "./audit";

/** Số lần đăng nhập sai tối đa trong một cửa sổ thời gian. */
export const MAX_LOGIN_ATTEMPTS = 5;
/** Cửa sổ thời gian: 1 phút. */
export const LOGIN_WINDOW_MS = 60_000;

export class RateLimitError extends UserError {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super(`Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${retryAfterSec} giây.`);
    this.name = "RateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

interface Attempt {
  fails: number;
  windowStart: number;
}

const attempts = new Map<string, Attempt>();

function mapKey(ip: string, identifier: string): string {
  return `${ip}\n${identifier.trim().toLowerCase()}`;
}

/** Xoá các mục đã hết cửa sổ; chỉ gọi khi Map phình to (chống rò rỉ bộ nhớ). */
function prune(now: number): void {
  for (const [k, a] of attempts) {
    if (now - a.windowStart >= LOGIN_WINDOW_MS) attempts.delete(k);
  }
}

export interface LoginAllowance {
  allowed: boolean;
  /** Số giây còn lại của cửa sổ chặn (> 0 khi allowed = false). Tương đương ngữ nghĩa header Retry-After. */
  retryAfterSec: number;
}

/**
 * Kiểm tra cặp (IP, định danh) có còn được thử đăng nhập không.
 * Đăng nhập của KhuMình chạy qua server action (form POST → redirect 303 của
 * Next.js) chứ không phải API JSON, nên app không tự đặt được HTTP 429 +
 * header Retry-After; thay vào đó request bị từ chối ở tầng ứng dụng và
 * `retryAfterSec` cho client biết chính xác khi nào được thử lại.
 */
export function checkLoginAllowed(ip: string, identifier: string, now: number = Date.now()): LoginAllowance {
  const k = mapKey(ip, identifier);
  const a = attempts.get(k);
  if (!a) return { allowed: true, retryAfterSec: 0 };
  if (now - a.windowStart >= LOGIN_WINDOW_MS) {
    attempts.delete(k);
    return { allowed: true, retryAfterSec: 0 };
  }
  if (a.fails < MAX_LOGIN_ATTEMPTS) return { allowed: true, retryAfterSec: 0 };
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - a.windowStart)) / 1000)),
  };
}

/** Ghi nhận một lần đăng nhập SAI (sai mật khẩu hoặc tài khoản không tồn tại). */
export function noteLoginFailure(ip: string, identifier: string, now: number = Date.now()): void {
  const k = mapKey(ip, identifier);
  const a = attempts.get(k);
  if (!a || now - a.windowStart >= LOGIN_WINDOW_MS) {
    // Cửa sổ mới: đếm lại từ đầu (cửa sổ cố định, không nới khi bị chặn).
    attempts.set(k, { fails: 1, windowStart: now });
  } else {
    a.fails += 1;
  }
  if (attempts.size > 10_000) prune(now);
}

/** Đăng nhập THÀNH CÔNG: xoá bộ đếm để người dùng thật không bị kẹt. */
export function noteLoginSuccess(ip: string, identifier: string): void {
  attempts.delete(mapKey(ip, identifier));
}

/**
 * Ném RateLimitError nếu cặp (IP, định danh) đã vượt ngưỡng.
 * Gọi TRƯỚC khi kiểm tra mật khẩu ở mọi điểm đăng nhập.
 */
export function assertLoginAllowed(ip: string, identifier: string, now: number = Date.now()): void {
  const { allowed, retryAfterSec } = checkLoginAllowed(ip, identifier, now);
  if (!allowed) throw new RateLimitError(retryAfterSec);
}

/**
 * IP của client khi chạy trong server action/route.
 *
 * Thứ tự ưu tiên (chống bypass rate-limit):
 * 1. `x-real-ip` — do Vercel tự đặt, client không giả mạo được.
 * 2. Phần tử CUỐI của `x-forwarded-for` — Vercel edge append IP thật vào cuối
 *    chuỗi; các phần tử đầu do client gửi sẵn nên kẻ tấn công có thể ghi bừa
 *    (lấy phần tử đầu sẽ cho mỗi request một key mới → rate-limit vô hiệu).
 *
 * Lưu ý: khi không có header nào, mọi request đều chung key "unknown" theo
 * từng định danh (vẫn chặn theo định danh, nhưng không phân biệt được IP).
 */
export async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return "unknown";
}

/** Chỉ dùng trong test: xoá toàn bộ bộ đếm. */
export function __resetLoginAttempts(): void {
  attempts.clear();
}

/** Chỉ dùng trong test: số mục hiện có trong bộ đếm (để kiểm chứng prune). */
export function __loginAttemptCount(): number {
  return attempts.size;
}
