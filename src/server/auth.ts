// Đăng ký/đăng nhập chủ trọ bằng email + mật khẩu; phiên lưu băm token trong DB.
// Đăng nhập người thuê (Google/Zalo/OTP) làm ở bước sau.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { getDb, withOrg, withUser } from "@/db/client";
import { memberships, organizations, sessions, users } from "@/db/schema";
import { UserError, type Actor } from "./audit";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_TTL_DAYS = 30;

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

/** Tạo tài khoản chủ trọ và tổ chức đầu tiên của họ. */
export async function signUpOwner(input: {
  email: string;
  password: string;
  displayName: string;
  orgName: string;
}): Promise<{ userId: string; orgId: string }> {
  const email = normalizeEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Email không hợp lệ");
  if (input.password.length < 8) throw new UserError("Mật khẩu cần ít nhất 8 ký tự");
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

export async function signIn(emailRaw: string, password: string): Promise<{ userId: string; token: string } | null> {
  const [user] = await getDb().select().from(users).where(eq(users.email, normalizeEmail(emailRaw)));
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return null;
  const token = randomBytes(32).toString("base64url");
  await getDb()
    .insert(sessions)
    .values({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000) });
  return { userId: user.id, token };
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
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date())));
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
