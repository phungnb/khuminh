// Chợ tiện ích quanh đây: cư dân đăng bán, cần mua, cho tặng, dịch vụ; xem tin trong bán kính.
// Giai đoạn 1: vị trí lấy theo cơ sở người dùng đang ở hoặc quản lý (chưa dùng GPS).
//
// Mọi truy cập bảng chợ đi qua withUser() — RLS theo app.user_id (drizzle/0007_market_rls.sql).
// Liên hệ người đăng ở bảng riêng, chỉ lộ khi người đăng đồng ý một lượt quan tâm.

import { and, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { withOrg, withUser } from "@/db/client";
import {
  leases,
  listingContacts,
  listingInterests,
  listingReports,
  listings,
  memberships,
  properties,
  propertyStaff,
  tenants,
  units,
  users,
} from "@/db/schema";
import { blur, boundingBox, distanceKm, type LatLng } from "@/lib/geo";
import { ForbiddenError, UserError, type Actor } from "./audit";
import { sendToUsers } from "./push";
import { today } from "./queries";
import { assertPropertyAccess, pgErrorCode } from "./setup";
import { tenantLinks } from "./tenant";

export type ListingKind = "sell" | "want" | "give" | "service";

export const LISTING_KIND_LABEL: Record<ListingKind, string> = {
  sell: "Cần bán",
  want: "Cần mua",
  give: "Cho tặng",
  service: "Dịch vụ",
};

export const CATEGORIES = [
  "Đồ gia dụng",
  "Điện tử",
  "Xe cộ",
  "Thời trang",
  "Đồ ăn, thức uống",
  "Phòng, chỗ ở",
  "Sửa chữa",
  "Dọn dẹp, giặt ủi",
  "Học tập",
  "Khác",
] as const;

/** Nơi người dùng gắn với (đang thuê hoặc quản lý) — làm tâm chợ và vị trí tin đăng. */
export interface Place {
  key: string;
  name: string;
  role: "tenant" | "manager";
  location: LatLng | null;
}

function placeKey(orgId: string, propertyId: string) {
  return `${orgId}.${propertyId}`;
}

export async function marketPlaces(userId: string): Promise<Place[]> {
  const out = new Map<string, Place>();
  const t = today();

  // Đang thuê: hợp đồng còn hiệu lực.
  const byOrg = new Map<string, string[]>();
  for (const l of await tenantLinks(userId)) byOrg.set(l.orgId, [...(byOrg.get(l.orgId) ?? []), l.tenantId]);
  for (const [orgId, tenantIds] of byOrg) {
    const rows = await withOrg({ orgId, userId }, (tx) =>
      tx
        .selectDistinct({ id: properties.id, name: properties.name, lat: properties.lat, lng: properties.lng })
        .from(leases)
        .innerJoin(units, eq(units.id, leases.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(
          and(
            inArray(leases.tenantId, tenantIds),
            eq(leases.status, "active"),
            or(isNull(leases.movedOutOn), gte(leases.movedOutOn, t)),
            isNull(properties.archivedAt),
          ),
        ),
    );
    for (const r of rows) out.set(placeKey(orgId, r.id), toPlace(orgId, r, "tenant"));
  }

  // Quản lý: chủ thấy mọi cơ sở của tổ chức, nhân viên thấy cơ sở được giao.
  const ms = await withUser(userId, (tx) =>
    tx.select({ orgId: memberships.orgId, role: memberships.role }).from(memberships).where(eq(memberships.userId, userId)),
  );
  for (const m of ms) {
    const rows = await withOrg({ orgId: m.orgId, userId }, (tx) =>
      tx
        .select({ id: properties.id, name: properties.name, lat: properties.lat, lng: properties.lng })
        .from(properties)
        .where(
          and(
            isNull(properties.archivedAt),
            m.role === "owner"
              ? undefined
              : inArray(
                  properties.id,
                  tx.select({ id: propertyStaff.propertyId }).from(propertyStaff).where(eq(propertyStaff.userId, userId)),
                ),
          ),
        ),
    );
    for (const r of rows) {
      const k = placeKey(m.orgId, r.id);
      if (!out.has(k)) out.set(k, toPlace(m.orgId, r, "manager"));
    }
  }
  return [...out.values()];
}

function toPlace(orgId: string, r: { id: string; name: string; lat: number | null; lng: number | null }, role: Place["role"]): Place {
  return {
    key: placeKey(orgId, r.id),
    name: r.name,
    role,
    location: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null,
  };
}

/** Chủ trọ đặt vị trí cơ sở (chủ hoặc nhân viên được giao). */
export async function setPropertyLocation(actor: Actor, propertyId: string, loc: LatLng | null): Promise<void> {
  await withOrg(actor, async (tx) => {
    await assertPropertyAccess(tx, actor, propertyId);
    await tx
      .update(properties)
      .set({ lat: loc?.lat ?? null, lng: loc?.lng ?? null })
      .where(eq(properties.id, propertyId));
  });
}

// ---------- Tin đăng ----------

export interface ListingRow {
  id: string;
  kind: ListingKind;
  category: string;
  title: string;
  body: string | null;
  price: number | null;
  areaLabel: string;
  status: "open" | "closed";
  hidden: boolean;
  createdAt: Date;
  authorName: string;
  /** Để mở trang "tin của người này". */
  authorId: string;
  mine: boolean;
  distanceKm: number | null;
  interestCount: number;
}

const listingCols = {
  id: listings.id,
  kind: listings.kind,
  category: listings.category,
  title: listings.title,
  body: listings.body,
  price: listings.price,
  lat: listings.lat,
  lng: listings.lng,
  areaLabel: listings.areaLabel,
  status: listings.status,
  hiddenAt: listings.hiddenAt,
  createdAt: listings.createdAt,
  authorUserId: listings.authorUserId,
  authorName: users.displayName,
  interestCount: sql<number>`(select count(*)::int from ${listingInterests} i where i.listing_id = ${listings.id})`,
};

interface RawListing {
  id: string;
  kind: ListingKind;
  category: string;
  title: string;
  body: string | null;
  price: number | null;
  lat: number;
  lng: number;
  areaLabel: string;
  status: "open" | "closed";
  hiddenAt: Date | null;
  createdAt: Date;
  authorUserId: string;
  authorName: string;
  interestCount: number;
}

function toRow(r: RawListing, userId: string, center: LatLng | null): ListingRow {
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    title: r.title,
    body: r.body,
    price: r.price,
    areaLabel: r.areaLabel,
    status: r.status,
    hidden: r.hiddenAt !== null,
    createdAt: r.createdAt,
    authorName: r.authorName,
    authorId: r.authorUserId,
    mine: r.authorUserId === userId,
    distanceKm: center ? distanceKm(center, { lat: r.lat, lng: r.lng }) : null,
    interestCount: Number(r.interestCount),
  };
}

/** Tin đang mở trong bán kính, mới nhất trước. */
export interface ListingFilter {
  kind?: ListingKind;
  category?: string;
  /** Tìm trong tiêu đề và mô tả. */
  q?: string;
  /** Chỉ tin đăng từ thời điểm này (vd. "mới hôm nay"). */
  since?: Date;
  /** Chỉ tin của một người đăng. */
  authorId?: string;
}

export async function searchListings(
  userId: string,
  center: LatLng,
  radiusKm: number,
  filter: ListingFilter = {},
  limit = 100,
): Promise<ListingRow[]> {
  const { kind, category, since, authorId } = filter;
  const q = filter.q?.trim().slice(0, 80);
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const b = boundingBox(center, radiusKm);
  const rows = (await withUser(userId, (tx) =>
    tx
      .select(listingCols)
      .from(listings)
      .innerJoin(users, eq(users.id, listings.authorUserId))
      .where(
        and(
          eq(listings.status, "open"),
          isNull(listings.hiddenAt),
          gte(listings.lat, b.minLat),
          lte(listings.lat, b.maxLat),
          gte(listings.lng, b.minLng),
          lte(listings.lng, b.maxLng),
          kind ? eq(listings.kind, kind) : undefined,
          category ? eq(listings.category, category) : undefined,
          like ? or(ilike(listings.title, like), ilike(listings.body, like)) : undefined,
          since ? gte(listings.createdAt, since) : undefined,
          authorId ? eq(listings.authorUserId, authorId) : undefined,
        ),
      )
      .orderBy(desc(listings.createdAt))
      .limit(limit * 3),
  )) as RawListing[];
  return rows
    .map((r) => toRow(r, userId, center))
    .filter((r) => r.distanceKm! <= radiusKm)
    .slice(0, limit);
}

export interface ListingInput {
  kind: ListingKind;
  category: string;
  title: string;
  body?: string | null;
  price?: number | null;
  contact: string;
  placeKey: string;
}

function validateListing(input: ListingInput) {
  if (!(input.kind in LISTING_KIND_LABEL)) throw new UserError("Loại tin không hợp lệ");
  if (!(CATEGORIES as readonly string[]).includes(input.category)) throw new UserError("Danh mục không hợp lệ");
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) throw new UserError("Tiêu đề cần từ 3 đến 120 ký tự");
  if ((input.body ?? "").length > 2000) throw new UserError("Mô tả tối đa 2000 ký tự");
  if (input.price !== null && input.price !== undefined) {
    if (!Number.isInteger(input.price) || input.price < 0 || input.price > 10_000_000_000) {
      throw new UserError("Giá không hợp lệ");
    }
  }
  const contact = input.contact.trim();
  if (contact.length < 6 || contact.length > 100) throw new UserError("Cần nhập SĐT hoặc Zalo để người mua liên hệ");
}

export async function createListing(userId: string, input: ListingInput): Promise<string> {
  validateListing(input);
  const place = (await marketPlaces(userId)).find((p) => p.key === input.placeKey);
  if (!place) throw new ForbiddenError("Bạn chỉ đăng tin tại nơi mình đang ở hoặc quản lý");
  if (!place.location) throw new UserError("Cơ sở này chưa có vị trí. Nhờ chủ trọ cập nhật vị trí trước.");
  const loc = blur(place.location);
  return withUser(userId, async (tx) => {
    const [l] = await tx
      .insert(listings)
      .values({
        authorUserId: userId,
        kind: input.kind,
        category: input.category,
        title: input.title.trim(),
        body: input.body?.trim() || null,
        price: input.kind === "give" ? null : (input.price ?? null),
        lat: loc.lat,
        lng: loc.lng,
        areaLabel: place.name,
      })
      .returning({ id: listings.id });
    await tx.insert(listingContacts).values({ listingId: l!.id, contact: input.contact.trim() });
    return l!.id;
  });
}

export interface InterestRow {
  id: string;
  userId: string;
  name: string;
  contact: string;
  note: string | null;
  status: "pending" | "accepted" | "declined";
  createdAt: Date;
}

export interface ListingDetail extends ListingRow {
  /** Liên hệ người đăng: có khi là người đăng hoặc đã được đồng ý. */
  contact: string | null;
  myInterest: InterestRow | null;
  /** Chỉ người đăng thấy. */
  interests: InterestRow[];
  reportedByMe: boolean;
}

export async function getListing(userId: string, listingId: string, center: LatLng | null): Promise<ListingDetail | null> {
  return withUser(userId, async (tx) => {
    const [r] = (await tx
      .select(listingCols)
      .from(listings)
      .innerJoin(users, eq(users.id, listings.authorUserId))
      .where(eq(listings.id, listingId))) as RawListing[];
    if (!r) return null;
    // RLS chỉ trả về liên hệ khi được phép.
    const [c] = await tx.select().from(listingContacts).where(eq(listingContacts.listingId, listingId));
    const ints = await tx
      .select({
        id: listingInterests.id,
        userId: listingInterests.userId,
        name: users.displayName,
        contact: listingInterests.contact,
        note: listingInterests.note,
        status: listingInterests.status,
        createdAt: listingInterests.createdAt,
      })
      .from(listingInterests)
      .innerJoin(users, eq(users.id, listingInterests.userId))
      .where(eq(listingInterests.listingId, listingId))
      .orderBy(desc(listingInterests.createdAt));
    const [rep] = await tx
      .select({ id: listingReports.id })
      .from(listingReports)
      .where(and(eq(listingReports.listingId, listingId), eq(listingReports.userId, userId)));
    const mine = r.authorUserId === userId;
    return {
      ...toRow(r, userId, center),
      contact: c?.contact ?? null,
      myInterest: ints.find((i) => i.userId === userId) ?? null,
      interests: mine ? ints : [],
      reportedByMe: Boolean(rep),
    };
  });
}

export async function expressInterest(userId: string, listingId: string, contact: string, note?: string | null): Promise<void> {
  const c = contact.trim();
  if (c.length < 6 || c.length > 100) throw new UserError("Cần nhập SĐT hoặc Zalo để người đăng liên hệ lại");
  if ((note ?? "").length > 500) throw new UserError("Lời nhắn tối đa 500 ký tự");
  const author = await withUser(userId, async (tx) => {
    const [l] = await tx
      .select({ author: listings.authorUserId, title: listings.title, status: listings.status })
      .from(listings)
      .where(eq(listings.id, listingId));
    if (!l) throw new UserError("Tin không còn");
    if (l.author === userId) throw new UserError("Đây là tin của bạn");
    if (l.status !== "open") throw new UserError("Tin đã đóng");
    try {
      await tx.insert(listingInterests).values({ listingId, userId, contact: c, note: note?.trim() || null });
    } catch (e) {
      if (pgErrorCode(e) === "23505") throw new UserError("Bạn đã bấm quan tâm tin này");
      throw e;
    }
    return l;
  });
  await sendToUsers([author.author], {
    title: "Có người quan tâm tin của bạn",
    body: author.title,
    url: `/app/tin/${listingId}`,
  });
}

/** Người đăng đồng ý (lộ liên hệ hai chiều) hoặc từ chối một lượt quan tâm. */
export async function decideInterest(userId: string, interestId: string, accept: boolean): Promise<string> {
  const res = await withUser(userId, async (tx) => {
    const [i] = await tx
      .select({ listingId: listingInterests.listingId, userId: listingInterests.userId, author: listings.authorUserId, title: listings.title })
      .from(listingInterests)
      .innerJoin(listings, eq(listings.id, listingInterests.listingId))
      .where(eq(listingInterests.id, interestId));
    if (!i || i.author !== userId) throw new ForbiddenError();
    await tx
      .update(listingInterests)
      .set({ status: accept ? "accepted" : "declined" })
      .where(eq(listingInterests.id, interestId));
    return i;
  });
  if (accept) {
    await sendToUsers([res.userId], {
      title: "Người đăng đã đồng ý liên hệ",
      body: res.title,
      url: `/app/tin/${res.listingId}`,
    });
  }
  return res.listingId;
}

export async function closeListing(userId: string, listingId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const r = await tx
      .update(listings)
      .set({ status: "closed" })
      .where(and(eq(listings.id, listingId), eq(listings.authorUserId, userId)))
      .returning({ id: listings.id });
    if (r.length === 0) throw new ForbiddenError();
  });
}

export async function reportListing(userId: string, listingId: string, reason: string): Promise<void> {
  const r = reason.trim();
  if (r.length < 3 || r.length > 300) throw new UserError("Cần ghi lý do báo cáo (3–300 ký tự)");
  await withUser(userId, async (tx) => {
    try {
      await tx.insert(listingReports).values({ listingId, userId, reason: r });
    } catch (e) {
      if (pgErrorCode(e) === "23505") throw new UserError("Bạn đã báo cáo tin này");
      if (pgErrorCode(e) === "42501") throw new UserError("Không báo cáo được tin này");
      throw e;
    }
  });
}

export async function myListings(userId: string): Promise<ListingRow[]> {
  const rows = (await withUser(userId, (tx) =>
    tx
      .select(listingCols)
      .from(listings)
      .innerJoin(users, eq(users.id, listings.authorUserId))
      .where(eq(listings.authorUserId, userId))
      .orderBy(desc(listings.createdAt)),
  )) as RawListing[];
  return rows.map((r) => toRow(r, userId, null));
}

export async function myInterests(userId: string): Promise<Array<{ listing: ListingRow; status: InterestRow["status"] }>> {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ ...listingCols, myStatus: listingInterests.status })
      .from(listingInterests)
      .innerJoin(listings, eq(listings.id, listingInterests.listingId))
      .innerJoin(users, eq(users.id, listings.authorUserId))
      .where(and(eq(listingInterests.userId, userId), ne(listings.authorUserId, userId)))
      .orderBy(desc(listingInterests.createdAt)),
  );
  return rows.map((r) => ({ listing: toRow(r as RawListing, userId, null), status: r.myStatus }));
}
