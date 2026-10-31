// Đăng ký/đăng nhập: chủ trọ dùng email, người thuê dùng số điện thoại (tạo qua link mời,
// xem tenant.ts). Mật khẩu băm scrypt; phiên lưu băm token trong DB.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, withOrg, withUser } from "@/db/client";
import { memberships, organizations, sessions, users } from "@/db/schema";
import { UserError, type Actor } from "./audit";
import { assertLoginAllowed, clientIp, noteLoginFailure, noteLoginSuccess } from "./rate-limit";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_TTL_DAYS = 30;
/** Mật khẩu mới (tạo hoặc đặt lại). Tài khoản cũ đặt trước quy định này vẫn đăng nhập được. */
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(key, expected);
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Số di động Việt Nam về dạng 0xxxxxxxxx; null nếu không hợp lệ. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[\s.\-()]/g, "");
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  else if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2);
  return /^0[35789]\d{8}$/.test(d) ? d : null;
}

/** Tạo tài khoản chủ trọ và tổ chức đầu tiên của họ. */
export async function signUpOwner(input: {
  email: string;
  password: string;
  displayName: string;
  orgName: string;
}): Promise<{ userId: string; orgId: string }> {
  const email = normalizeEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Email không hợp lệ");
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new UserError(`Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
  if (!input.displayName.trim()) throw new UserError("Cần nhập tên");
  const db = getDb();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) throw new UserError("Email đã được đăng ký");

  const [user] = await db
    .insert(users)
    .values({ email, displayName: input.displayName.trim(), passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id });
  const orgId = crypto.randomUUID();
  await withOrg({ orgId, userId: user!.id }, async (tx) => {
    await tx.insert(organizations).values({ id: orgId, name: input.orgName.trim() || input.displayName.trim() });
    await tx.insert(memberships).values({ orgId, userId: user!.id, role: "owner" });
  });
  return { userId: user!.id, orgId };
}

/** Đăng nhập bằng email hoặc số điện thoại. Chặn brute-force: tối đa 5 lần sai / 1 phút / (IP, tài khoản). */
export async function signIn(login: string, password: string): Promise<{ userId: string; token: string } | null> {
  const ip = await clientIp();
  const identifier = login.includes("@") ? normalizeEmail(login) : (normalizePhone(login) ?? login.trim());
  assertLoginAllowed(ip, identifier);
  const phone = login.includes("@") ? null : normalizePhone(login);
  const [user] = await getDb()
    .select()
    .from(users)
    .where(phone ? eq(users.phone, phone) : eq(users.email, normalizeEmail(login)));
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    noteLoginFailure(ip, identifier);
    return null;
  }
  noteLoginSuccess(ip, identifier);
  // Chỉ báo khóa sau khi đúng mật khẩu: không lộ tài khoản nào tồn tại.
  if (user.lockedAt) throw new UserError(LOCKED_MESSAGE);
  return { userId: user.id, token: await createSession(user.id) };
}

export const LOCKED_MESSAGE = "Tài khoản đã bị khóa. Liên hệ hỗ trợ KhuMình nếu bạn cho rằng đây là nhầm lẫn.";

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000) });
  return token;
}

export async function signOut(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function userFromSession(token: string | undefined) {
  if (!token) return null;
  const [row] = await getDb()
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date()), isNull(users.lockedAt)));
  return row ?? null;
}

/** Tổ chức người dùng là thành viên; MVP chọn tổ chức đầu tiên. */
export async function actorFor(userId: string, orgId?: string): Promise<Actor | null> {
  const rows = await withUser(userId, (tx) =>
    tx.select({ orgId: memberships.orgId, role: memberships.role }).from(memberships).where(eq(memberships.userId, userId)),
  );
  const m = orgId ? rows.find((r) => r.orgId === orgId) : rows[0];
  return m ? { orgId: m.orgId, userId, role: m.role } : null;
}
