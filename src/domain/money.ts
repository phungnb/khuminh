// Tiền luôn là số nguyên đồng (VND). Không dùng số thực cho tiền.
// Mọi giá trị ở đây nhỏ hơn 2^53 nên phép nhân số nguyên trên Number vẫn chính xác.

export type Dong = number;

export function assertDong(v: number, label = "số tiền"): void {
  if (!Number.isSafeInteger(v)) throw new Error(`${label} phải là số nguyên đồng: ${v}`);
}

/**
 * Chia làm tròn nửa lên (half-up, theo trị tuyệt đối) cho số nguyên: round(num / den).
 * den > 0.
 */
export function divRound(num: number, den: number): number {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0) {
    throw new Error(`divRound: tham số không hợp lệ ${num}/${den}`);
  }
  const sign = num < 0 ? -1 : 1;
  const a = Math.abs(num);
  const q = Math.floor(a / den);
  const r = a - q * den;
  return sign * (r * 2 >= den ? q + 1 : q);
}

/** Làm tròn tổng tiền tới bội số `step` (1, 100, 500, 1000...), nửa lên. */
export function roundTo(amount: Dong, step: number): Dong {
  if (step <= 1) return amount;
  return divRound(amount, step) * step;
}

export function formatVnd(amount: Dong): string {
  return `${amount.toLocaleString("vi-VN")}đ`;
}
