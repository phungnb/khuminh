// Unit test cho bộ giới hạn đăng nhập sai (không cần DB).
// Quy ước SPEC: 5 lần sai / 1 phút / cặp (IP, định danh) → lần thứ 6 bị từ chối.

import { describe, expect, it, beforeEach } from "vitest";
import {
  LOGIN_WINDOW_MS,
  MAX_LOGIN_ATTEMPTS,
  RateLimitError,
  assertLoginAllowed,
  checkLoginAllowed,
  noteLoginFailure,
  noteLoginSuccess,
  __resetLoginAttempts,
} from "./rate-limit";

const IP = "203.0.113.7";
const EMAIL = "ChuTro@Example.com";

beforeEach(() => {
  __resetLoginAttempts();
});

describe("rate-limit đăng nhập", () => {
  it("cho phép 5 lần sai, lần thứ 6 bị chặn kèm retryAfterSec", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      expect(checkLoginAllowed(IP, EMAIL, t0 + i * 1000).allowed).toBe(true);
      noteLoginFailure(IP, EMAIL, t0 + i * 1000);
    }
    const denied = checkLoginAllowed(IP, EMAIL, t0 + 5000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
    expect(denied.retryAfterSec).toBeLessThanOrEqual(60);
    expect(() => assertLoginAllowed(IP, EMAIL, t0 + 5000)).toThrow(RateLimitError);
  });

  it("RateLimitError báo đúng số giây còn phải chờ", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) noteLoginFailure(IP, EMAIL, t0);
    const { retryAfterSec } = checkLoginAllowed(IP, EMAIL, t0 + 10_000);
    expect(retryAfterSec).toBe(50);
    try {
      assertLoginAllowed(IP, EMAIL, t0 + 10_000);
      expect.unreachable("phải ném RateLimitError");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfterSec).toBe(50);
      expect((e as Error).message).toContain("50 giây");
    }
  });

  it("hết cửa sổ 1 phút thì được thử lại", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) noteLoginFailure(IP, EMAIL, t0);
    expect(checkLoginAllowed(IP, EMAIL, t0).allowed).toBe(false);
    expect(checkLoginAllowed(IP, EMAIL, t0 + LOGIN_WINDOW_MS).allowed).toBe(true);
    expect(checkLoginAllowed(IP, EMAIL, t0 + LOGIN_WINDOW_MS + 1).allowed).toBe(true);
  });

  it("đăng nhập thành công xoá bộ đếm", () => {
    const t0 = 4_000_000;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) noteLoginFailure(IP, EMAIL, t0);
    noteLoginSuccess(IP, EMAIL);
    expect(checkLoginAllowed(IP, EMAIL, t0).allowed).toBe(true);
    // Sau reset, lại được đủ 5 lần mới
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) noteLoginFailure(IP, EMAIL, t0);
    expect(checkLoginAllowed(IP, EMAIL, t0).allowed).toBe(false);
  });

  it("phân biệt theo IP và theo định danh (không chặn nhầm người khác)", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) noteLoginFailure(IP, EMAIL, t0);
    expect(checkLoginAllowed("198.51.100.9", EMAIL, t0).allowed).toBe(true); // IP khác
    expect(checkLoginAllowed(IP, "nguoikhac@example.com", t0).allowed).toBe(true); // email khác
  });

  it("định danh không phân biệt hoa thường và khoảng trắng", () => {
    const t0 = 6_000_000;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) noteLoginFailure(IP, "  Chutro@example.com ", t0);
    expect(checkLoginAllowed(IP, "chutro@EXAMPLE.com", t0).allowed).toBe(false);
  });
});
