// Unit test cho bộ giới hạn đăng nhập sai (không cần DB).
// Quy ước SPEC: 5 lần sai / 1 phút / cặp (IP, định danh) → lần thứ 6 bị từ chối.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  LOGIN_WINDOW_MS,
  MAX_LOGIN_ATTEMPTS,
  RateLimitError,
  assertLoginAllowed,
  checkLoginAllowed,
  clientIp,
  noteLoginFailure,
  noteLoginSuccess,
  __loginAttemptCount,
  __resetLoginAttempts,
} from "./rate-limit";
import { LOCKED_MESSAGE, hashPassword, signIn } from "./auth";

// Mock header cho clientIp(): next/headers chỉ có trong runtime Next.js.
const headerStore = vi.hoisted(() => ({ map: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerStore.map.get(name.toLowerCase()) ?? null,
  }),
}));

// Mock DB cho test signIn (chỉ mock tầng getDb, mật khẩu vẫn scrypt thật).
const dbUser = vi.hoisted(() => ({
  current: null as { id: string; passwordHash: string; lockedAt: Date | null } | null,
}));
vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve(dbUser.current ? [dbUser.current] : []) }) }),
    insert: () => ({ values: () => Promise.resolve([]) }),
  }),
  withOrg: vi.fn(),
  withUser: vi.fn(),
}));

function setHeaders(h: Record<string, string>) {
  headerStore.map = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}

const IP = "203.0.113.7";
const EMAIL = "ChuTro@Example.com";

beforeEach(() => {
  __resetLoginAttempts();
  setHeaders({});
  dbUser.current = null;
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

  it("prune khi Map vượt 10.000 mục: mục hết cửa sổ bị xoá, mục còn hạn giữ nguyên", () => {
    const t0 = 10_000_000;
    for (let i = 0; i < 10_000; i++) noteLoginFailure(IP, `user${i}@example.com`, t0);
    expect(__loginAttemptCount()).toBe(10_000);
    // Sang cửa sổ mới: lần sai thứ 10.001 kích hoạt prune → xoá 10.000 mục hết hạn.
    const t1 = t0 + LOGIN_WINDOW_MS + 1000;
    noteLoginFailure(IP, "fresh@example.com", t1);
    expect(__loginAttemptCount()).toBe(1);
    // Mục còn hạn không bị prune cuốn theo: đủ 5 lần sai vẫn bị chặn.
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) noteLoginFailure(IP, "fresh@example.com", t1);
    expect(checkLoginAllowed(IP, "fresh@example.com", t1).allowed).toBe(false);
  });
});

describe("clientIp — chống giả mạo header", () => {
  it("XFF nhiều phần tử → dùng IP CUỐI (IP Vercel append), bỏ qua phần tử đầu do client ghi", async () => {
    setHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.7" });
    expect(await clientIp()).toBe("203.0.113.7");
  });

  it("XFF một phần tử, khoảng trắng và phần tử rỗng cuối vẫn cho IP thật", async () => {
    setHeaders({ "x-forwarded-for": "  203.0.113.7 , " });
    expect(await clientIp()).toBe("203.0.113.7");
  });

  it("x-real-ip được ưu tiên khi cả hai header đều có", async () => {
    setHeaders({ "x-forwarded-for": "1.2.3.4, 203.0.113.7", "x-real-ip": "198.51.100.9" });
    expect(await clientIp()).toBe("198.51.100.9");
  });

  it("không header nào → 'unknown' (mọi request ẩn danh chung một bucket theo định danh)", async () => {
    setHeaders({});
    expect(await clientIp()).toBe("unknown");
  });
});

describe("tương tác rate-limit với tài khoản bị khóa (lockedAt)", () => {
  const nowSpy = vi.spyOn(Date, "now");

  afterEach(() => {
    nowSpy.mockReset();
  });

  it("bị rate-limit thì báo RateLimitError trước cả khi tài khoản bị khóa; hết cửa sổ thì báo khóa; mở khóa thì đăng nhập được", async () => {
    const t0 = 20_000_000;
    nowSpy.mockImplementation(() => t0);
    setHeaders({ "x-real-ip": IP });
    dbUser.current = { id: "user-1", passwordHash: await hashPassword("mat-khau-dung"), lockedAt: new Date(t0) };

    // 5 lần sai mật khẩu → đủ ngưỡng chặn.
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
      expect(await signIn("chutro@example.com", "sai-mat-khau")).toBeNull();
    }
    // Lần 6, dù đúng mật khẩu, vẫn bị rate-limit (RateLimitError lấn cả thông báo khóa).
    await expect(signIn("chutro@example.com", "mat-khau-dung")).rejects.toThrow(RateLimitError);

    // Hết cửa sổ 1 phút: không còn bị rate-limit → đúng mật khẩu thì báo khóa tài khoản.
    nowSpy.mockImplementation(() => t0 + LOGIN_WINDOW_MS + 1000);
    await expect(signIn("chutro@example.com", "mat-khau-dung")).rejects.toThrow(LOCKED_MESSAGE);

    // Mở khóa (lockedAt = null): đăng nhập thành công trở lại.
    dbUser.current = { ...dbUser.current, lockedAt: null };
    const ok = await signIn("chutro@example.com", "mat-khau-dung");
    expect(ok?.userId).toBe("user-1");
    expect(ok?.token).toBeTruthy();
  });
});
