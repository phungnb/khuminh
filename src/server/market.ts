// Chợ tiện ích quanh đây: cư dân đăng bán, cần mua, cho tặng, dịch vụ; xem tin trong bán kính.
// Giai đoạn 1: vị trí lấy theo cơ sở người dùng đang ở hoặc quản lý (chưa dùng GPS).
//
// Mọi truy cập bảng chợ đi qua withUser() — RLS theo app.user_id (drizzle/0007_market_rls.sql).
// Liên hệ người đăng ở bảng riêng, chỉ lộ khi người đăng đồng ý một lượt quan tâm.

import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { withOrg, withUser } from "@/db/client";
import {
  leases,
  listingContacts,
  listingImages,
  listingInterests,
  listingReports,
  listings,
  memberships,
  properties,
  propertyStaff,
  sessions,
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

/** Số ngày một tin được hiển thị ở chợ, tính từ lúc đăng, gia hạn hoặc mở lại. */
export const LISTING_TTL_DAYS = 30;

/** Chỉ gia hạn khi tin đã hết hạn hoặc còn tối đa ngần này ngày. */
export const RENEW_WINDOW_DAYS = 3;

/** Số ảnh tối đa trên một tin; ảnh đầu tiên là ảnh bìa. */
export const MAX_LISTING_PHOTOS = 6;

/** Dung lượng tối đa mỗi ảnh sau khi client đã nén (chặn payload bất thường). */
export const MAX_PHOTO_BYTES = 1_000_000;

export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface PhotoInput {
  contentType: string;
  data: Uint8Array;
}

function validatePhotos(photos: PhotoInput[]) {
  if (photos.length > MAX_LISTING_PHOTOS) throw new UserError(`Mỗi tin tối đa ${MAX_LISTING_PHOTOS} ảnh`);
  for (const p of photos) {
    if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(p.contentType)) {
      throw new UserError("Chỉ nhận ảnh JPEG, PNG hoặc WebP");
    }
    if (p.data.byteLength === 0 || p.data.byteLength > MAX_PHOTO_BYTES) {
      throw new UserError("Mỗi ảnh tối đa 1 MB sau khi nén");
    }
  }
}

const DAY_MS = 24 * 3600 * 1000;

function ttlFromNow(): Date {
  return new Date(Date.now() + LISTING_TTL_DAYS * DAY_MS);
}

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
  /** Ngày người đăng bấm "Đã bán" (null nếu chưa bán). */
  soldAt: Date | null;
  hidden: boolean;
  /** Thời điểm tin hết hạn hiển thị ở chợ. */
  expiresAt: Date;
  /** Đang mở nhưng đã qua hạn: không còn hiện ở chợ, người đăng gia hạn để hiện lại. */
  expired: boolean;
  createdAt: Date;
  authorName: string;
  /** Để mở trang "tin của người này". */
  authorId: string;
  mine: boolean;
  distanceKm: number | null;
  interestCount: number;
  /** Ảnh bìa (ảnh đầu tiên) nếu tin có ảnh thật; null thì thẻ tin hiện minh hoạ theo danh mục. */
  coverImageId: string | null;
  /** Hồ sơ người bán mini: số tin đã bán + lần đăng nhập gần nhất (xấp xỉ "hoạt động … trước"). */
  sellerSoldCount: number;
  sellerLastActiveAt: Date | null;
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
  soldAt: listings.soldAt,
  hiddenAt: listings.hiddenAt,
  expiresAt: listings.expiresAt,
  createdAt: listings.createdAt,
  authorUserId: listings.authorUserId,
  authorName: users.displayName,
  interestCount: sql<number>`(select count(*)::int from ${listingInterests} i where i.listing_id = ${listings.id})`,
  coverImageId: sql<string | null>`(select i.id from ${listingImages} i where i.listing_id = ${listings.id} order by i.position asc limit 1)`,
  sellerSoldCount: sql<number>`(select count(*)::int from ${listings} l where l.author_user_id = ${listings.authorUserId} and l.sold_at is not null)`,
  sellerLastActiveAt: sql<Date | null>`(select max(s.created_at) from ${sessions} s where s.user_id = ${listings.authorUserId})`,
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
  soldAt: Date | null;
  hiddenAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  authorUserId: string;
  authorName: string;
  interestCount: number;
  coverImageId: string | null;
  sellerSoldCount: number;
  sellerLastActiveAt: Date | null;
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
    soldAt: r.soldAt,
    hidden: r.hiddenAt !== null,
    expiresAt: r.expiresAt,
    expired: r.status === "open" && r.expiresAt.getTime() <= Date.now(),
    createdAt: r.createdAt,
    authorName: r.authorName,
    authorId: r.authorUserId,
    mine: r.authorUserId === userId,
    distanceKm: center ? distanceKm(center, { lat: r.lat, lng: r.lng }) : null,
    interestCount: Number(r.interestCount),
    coverImageId: r.coverImageId ?? null,
    sellerSoldCount: Number(r.sellerSoldCount),
    // max() qua sql thô trả về chuỗi ở runtime dù kiểu khai là Date — chuẩn hoá về Date cho đúng kiểu.
    sellerLastActiveAt: r.sellerLastActiveAt ? new Date(r.sellerLastActiveAt) : null,
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
          sql`${listings.expiresAt} > now()`,
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
  /** Ảnh thật đính kèm (đã nén phía client); tối đa MAX_LISTING_PHOTOS. */
  photos?: PhotoInput[];
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
  const photos = input.photos ?? [];
  validatePhotos(photos);
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
        expiresAt: ttlFromNow(),
      })
      .returning({ id: listings.id });
    await tx.insert(listingContacts).values({ listingId: l!.id, contact: input.contact.trim() });
    if (photos.length) {
      await tx.insert(listingImages).values(
        photos.map((p, i) => ({ listingId: l!.id, position: i, contentType: p.contentType, data: p.data })),
      );
    }
    return l!.id;
  });
}

export interface InterestRow {
  id: string;
  userId: string;
  name: string;
  contact: string;
  note: string | null;
  /** Giá đề xuất khi quan tâm (đồng, riêng tư); null nếu người mua không trả giá. */
  offerPrice: number | null;
  status: "pending" | "accepted" | "declined";
  createdAt: Date;
}

export interface ListingDetail extends ListingRow {
  /** Mọi ảnh của tin theo thứ tự hiển thị (rỗng nếu tin chưa có ảnh thật). */
  imageIds: string[];
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
    const imgs = await tx
      .select({ id: listingImages.id })
      .from(listingImages)
      .where(eq(listingImages.listingId, listingId))
      .orderBy(listingImages.position);
    // RLS chỉ trả về liên hệ khi được phép.
    const [c] = await tx.select().from(listingContacts).where(eq(listingContacts.listingId, listingId));
    const ints = await tx
      .select({
        id: listingInterests.id,
        userId: listingInterests.userId,
        name: users.displayName,
        contact: listingInterests.contact,
        note: listingInterests.note,
        offerPrice: listingInterests.offerPrice,
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
      imageIds: imgs.map((i) => i.id),
      contact: c?.contact ?? null,
      myInterest: ints.find((i) => i.userId === userId) ?? null,
      interests: mine ? ints : [],
      reportedByMe: Boolean(rep),
    };
  });
}

export async function expressInterest(
  userId: string,
  listingId: string,
  contact: string,
  note?: string | null,
  offerPrice?: number | null,
): Promise<void> {
  const c = contact.trim();
  if (c.length < 6 || c.length > 100) throw new UserError("Cần nhập SĐT hoặc Zalo để người đăng liên hệ lại");
  if ((note ?? "").length > 500) throw new UserError("Lời nhắn tối đa 500 ký tự");
  if (offerPrice !== null && offerPrice !== undefined && (!Number.isInteger(offerPrice) || offerPrice < 0 || offerPrice > 10_000_000_000)) {
    throw new UserError("Trả giá không hợp lệ");
  }
  const author = await withUser(userId, async (tx) => {
    const [l] = await tx
      .select({ author: listings.authorUserId, title: listings.title, status: listings.status, soldAt: listings.soldAt })
      .from(listings)
      .where(eq(listings.id, listingId));
    if (!l) throw new UserError("Tin không còn");
    if (l.author === userId) throw new UserError("Đây là tin của bạn");
    if (l.soldAt) throw new UserError("Tin đã bán");
    if (l.status !== "open") throw new UserError("Tin đã đóng");
    try {
      await tx.insert(listingInterests).values({ listingId, userId, contact: c, note: note?.trim() || null, offerPrice: offerPrice ?? null });
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
  const l = await ownListing(userId, listingId);
  if (l.soldAt) throw new UserError("Tin đã bán, không đóng lại được");
  await withUser(userId, async (tx) => {
    const r = await tx
      .update(listings)
      .set({ status: "closed" })
      .where(and(eq(listings.id, listingId), eq(listings.authorUserId, userId)))
      .returning({ id: listings.id });
    if (r.length === 0) throw new ForbiddenError();
  });
}

/** Người đăng bấm "Đã bán": tin rời feed (status closed) + ghi ngày bán, không mở lại/gia hạn được. */
export async function markSoldListing(userId: string, listingId: string): Promise<void> {
  const l = await ownListing(userId, listingId);
  if (l.soldAt) throw new UserError("Tin đã bán rồi");
  if (l.status !== "open") throw new UserError("Tin đã đóng");
  await withUser(userId, (tx) =>
    tx
      .update(listings)
      .set({ status: "closed", soldAt: new Date() })
      .where(and(eq(listings.id, listingId), eq(listings.authorUserId, userId))),
  );
}

/** Đọc tin của chính người đăng để kiểm tra trạng thái vòng đời trước khi đổi. */
async function ownListing(userId: string, listingId: string) {
  const [l] = await withUser(userId, (tx) =>
    tx
      .select({ status: listings.status, soldAt: listings.soldAt, hiddenAt: listings.hiddenAt, expiresAt: listings.expiresAt })
      .from(listings)
      .where(and(eq(listings.id, listingId), eq(listings.authorUserId, userId))),
  );
  if (!l) throw new ForbiddenError();
  return l;
}

/** Gia hạn hiển thị thêm 30 ngày. Chỉ khi tin đang mở và đã hết hạn hoặc sắp hết hạn. */
export async function renewListing(userId: string, listingId: string): Promise<void> {
  const l = await ownListing(userId, listingId);
  if (l.soldAt) throw new UserError("Tin đã bán, không gia hạn được");
  if (l.hiddenAt) throw new UserError("Tin đang bị ẩn do báo cáo, không gia hạn được");
  if (l.status !== "open") throw new UserError("Tin đã đóng. Mở lại tin để đăng tiếp.");
  if (l.expiresAt.getTime() > Date.now() + RENEW_WINDOW_DAYS * DAY_MS) {
    throw new UserError(`Tin còn hạn trên ${RENEW_WINDOW_DAYS} ngày, chưa cần gia hạn`);
  }
  await withUser(userId, (tx) =>
    tx
      .update(listings)
      .set({ expiresAt: ttlFromNow() })
      .where(and(eq(listings.id, listingId), eq(listings.authorUserId, userId))),
  );
}

/** Mở lại tin đã đóng: trạng thái mở và hạn hiển thị tính lại 30 ngày. */
export async function reopenListing(userId: string, listingId: string): Promise<void> {
  const l = await ownListing(userId, listingId);
  if (l.soldAt) throw new UserError("Tin đã bán, không mở lại được");
  if (l.hiddenAt) throw new UserError("Tin đang bị ẩn do báo cáo, không mở lại được");
  if (l.status !== "closed") throw new UserError("Tin chưa đóng");
  await withUser(userId, (tx) =>
    tx
      .update(listings)
      .set({ status: "open", expiresAt: ttlFromNow() })
      .where(and(eq(listings.id, listingId), eq(listings.authorUserId, userId))),
  );
}

/** Xoá hẳn tin của mình (liên hệ, lượt quan tâm, báo cáo, ảnh xoá theo cascade). */
export async function deleteListing(userId: string, listingId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const r = await tx
      .delete(listings)
      .where(and(eq(listings.id, listingId), eq(listings.authorUserId, userId)))
      .returning({ id: listings.id });
    if (r.length === 0) throw new ForbiddenError();
  });
}

/** Thêm ảnh vào tin của mình; tổng số ảnh sau khi thêm không vượt quá giới hạn. */
export async function addListingPhotos(userId: string, listingId: string, photos: PhotoInput[]): Promise<void> {
  if (photos.length === 0) throw new UserError("Chưa chọn ảnh nào");
  validatePhotos(photos);
  await ownListing(userId, listingId);
  await withUser(userId, async (tx) => {
    const existing = await tx
      .select({ position: listingImages.position })
      .from(listingImages)
      .where(eq(listingImages.listingId, listingId));
    if (existing.length + photos.length > MAX_LISTING_PHOTOS) {
      throw new UserError(`Mỗi tin tối đa ${MAX_LISTING_PHOTOS} ảnh (đang có ${existing.length})`);
    }
    const next = existing.reduce((m, r) => Math.max(m, r.position), -1) + 1;
    await tx.insert(listingImages).values(
      photos.map((p, i) => ({ listingId, position: next + i, contentType: p.contentType, data: p.data })),
    );
  });
}

/** Xoá một ảnh khỏi tin của mình. */
export async function removeListingPhoto(userId: string, listingId: string, imageId: string): Promise<void> {
  await ownListing(userId, listingId);
  await withUser(userId, async (tx) => {
    const r = await tx
      .delete(listingImages)
      .where(and(eq(listingImages.id, imageId), eq(listingImages.listingId, listingId)))
      .returning({ id: listingImages.id });
    if (r.length === 0) throw new UserError("Không thấy ảnh này");
  });
}

/** Nội dung một ảnh để route /api/img phát ra; RLS quyết định người xem có được thấy hay không. */
export async function getListingImage(
  userId: string,
  imageId: string,
): Promise<{ contentType: string; data: Uint8Array } | null> {
  const [img] = await withUser(userId, (tx) =>
    tx
      .select({ contentType: listingImages.contentType, data: listingImages.data })
      .from(listingImages)
      .where(eq(listingImages.id, imageId)),
  );
  return img ?? null;
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

// ---------- Gian hàng (trang của một người đăng) ----------

export interface SellerShop {
  name: string;
  /** Ngày tạo tài khoản người bán. */
  memberSince: Date;
  /** Khu vực của tin gần nhất, để ghi "người bán quanh …". */
  areaLabel: string | null;
  /** Tin đang mở còn hạn trong bán kính của người xem, mới nhất trước. */
  open: ListingRow[];
  /** Tin đã bán (người đăng bấm "Đã bán") trong bán kính của người xem, mới bán trước (tối đa 8). */
  sold: ListingRow[];
  /** Tổng số tin đã bán trong bán kính (đếm đủ, không chỉ phần đã lấy). */
  soldCount: number;
}

/**
 * Gian hàng của một người đăng, trong phạm vi người xem vốn đã thấy ở Quanh đây.
 * Mọi thứ đều giới hạn trong bán kính quanh khu của người xem như trang cũ,
 * để không lộ hoạt động của người bán ở khu khác.
 */
export async function sellerShop(userId: string, sellerId: string, center: LatLng, radiusKm: number): Promise<SellerShop | null> {
  const [u] = await withUser(userId, (tx) =>
    tx.select({ name: users.displayName, createdAt: users.createdAt }).from(users).where(eq(users.id, sellerId)),
  );
  if (!u) return null;
  const open = await searchListings(userId, center, radiusKm, { authorId: sellerId }, 50);
  const b = boundingBox(center, radiusKm);
  const soldRows = (await withUser(userId, (tx) =>
    tx
      .select(listingCols)
      .from(listings)
      .innerJoin(users, eq(users.id, listings.authorUserId))
      .where(
        and(
          eq(listings.authorUserId, sellerId),
          eq(listings.status, "closed"),
          isNotNull(listings.soldAt),
          isNull(listings.hiddenAt),
          gte(listings.lat, b.minLat),
          lte(listings.lat, b.maxLat),
          gte(listings.lng, b.minLng),
          lte(listings.lng, b.maxLng),
        ),
      )
      .orderBy(desc(listings.soldAt))
      .limit(50),
  )) as RawListing[];
  const soldAll = soldRows.map((r) => toRow(r, userId, center)).filter((r) => r.distanceKm! <= radiusKm);
  return {
    name: u.name,
    memberSince: u.createdAt,
    areaLabel: open[0]?.areaLabel ?? soldAll[0]?.areaLabel ?? null,
    open,
    sold: soldAll.slice(0, 8),
    soldCount: soldAll.length,
  };
}

/** Hộp thư người bán: lượt quan tâm vào tin của mình, gom theo từng tin, tin có quan tâm mới nhất trước. */
export interface SellerInboxGroup {
  listing: ListingRow;
  interests: InterestRow[];
}

export async function sellerInterestInbox(userId: string): Promise<SellerInboxGroup[]> {
  const mine = await myListings(userId);
  if (mine.length === 0) return [];
  const ids = mine.map((l) => l.id);
  const rows = await withUser(userId, (tx) =>
    tx
      .select({
        listingId: listingInterests.listingId,
        id: listingInterests.id,
        userId: listingInterests.userId,
        name: users.displayName,
        contact: listingInterests.contact,
        note: listingInterests.note,
        offerPrice: listingInterests.offerPrice,
        status: listingInterests.status,
        createdAt: listingInterests.createdAt,
      })
      .from(listingInterests)
      .innerJoin(users, eq(users.id, listingInterests.userId))
      .where(inArray(listingInterests.listingId, ids))
      .orderBy(desc(listingInterests.createdAt)),
  );
  const byListing = new Map<string, InterestRow[]>();
  for (const r of rows) {
    const list = byListing.get(r.listingId) ?? [];
    list.push({
      id: r.id,
      userId: r.userId,
      name: r.name,
      contact: r.contact,
      note: r.note,
      offerPrice: r.offerPrice,
      status: r.status,
      createdAt: r.createdAt,
    });
    byListing.set(r.listingId, list);
  }
  const groups = mine
    .filter((l) => byListing.has(l.id))
    .map((listing) => ({ listing, interests: byListing.get(listing.id)! }));
  groups.sort(
    (a, b) => (b.interests[0]?.createdAt.getTime() ?? 0) - (a.interests[0]?.createdAt.getTime() ?? 0),
  );
  return groups;
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
