// Kiểm thử chợ tiện ích quanh đây trên Postgres thật: bán kính, quan tâm/lộ liên hệ, báo cáo, RLS.

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, withOrg, withUser } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import {
  closeListing,
  createListing,
  decideInterest,
  expressInterest,
  getListing,
  marketPlaces,
  myInterests,
  myListings,
  reportListing,
  searchListings,
  setPropertyLocation,
} from "./market";
import { setPushSenderForTests, type PushMessage } from "./push";
import { createLease, createProperty, importUnits } from "./setup";
import { acceptTenantInvite, createTenantInvite } from "./tenant";

const sent: PushMessage[] = [];
const phone = () => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

async function tenantIn(owner: Actor, propertyId: string, code: string, name: string): Promise<string> {
  await importUnits(owner, propertyId, [{ code }], []);
  const [u] = await withOrg(owner, (tx) => tx.select().from(s.units).where(eq(s.units.code, code)));
  const lease = await createLease(owner, { unitId: u!.id, tenant: { fullName: name }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 1_000_000 });
  return acceptTenantInvite((await createTenantInvite(owner, lease)).token, { phone: phone(), password: "abcdef12" });
}

describe("chợ quanh đây", () => {
  let a: Actor; // chủ trọ A ở quận 1
  let b: Actor; // chủ trọ B ở Thủ Đức, cách ~12 km
  let pA: string;
  let pB: string;
  let tA: string; // người thuê ở A
  let tA2: string;
  let tB: string; // người thuê ở B
  let keyA: string;
  let keyB: string;

  beforeAll(async () => {
    setPushSenderForTests(async (_sub, msg) => {
      sent.push(msg);
      return "ok";
    });
    a = await newOwner("cho-a");
    b = await newOwner("cho-b");
    pA = await createProperty(a, { name: "Dãy trọ A" });
    pB = await createProperty(b, { name: "Dãy trọ B" });
    tA = await tenantIn(a, pA, "A1", "An");
    tA2 = await tenantIn(a, pA, "A2", "Ánh");
    tB = await tenantIn(b, pB, "B1", "Bảo");
    keyA = `${a.orgId}.${pA}`;
    keyB = `${b.orgId}.${pB}`;
    for (const u of [tA, tA2, tB]) {
      await getDb().insert(s.pushSubscriptions).values({ userId: u, endpoint: `https://push.example/${u}`, p256dh: "k", auth: "a" });
    }
  });

  afterAll(() => setPushSenderForTests(null));

  it("nơi của người dùng: người thuê thấy cơ sở đang ở, chủ thấy cơ sở quản lý", async () => {
    expect((await marketPlaces(tA)).map((p) => [p.key, p.role])).toEqual([[keyA, "tenant"]]);
    expect((await marketPlaces(a.userId)).map((p) => [p.key, p.role])).toEqual([[keyA, "manager"]]);
    expect((await marketPlaces(tA))[0]!.location).toBeNull();
  });

  it("chưa có vị trí cơ sở thì chưa đăng được; nhân viên/chủ khác không đặt vị trí hộ", async () => {
    const input = { kind: "sell" as const, category: "Điện tử", title: "Quạt đứng", price: 150_000, contact: "0901234567", placeKey: keyA };
    await expect(createListing(tA, input)).rejects.toThrow(/chưa có vị trí/);
    await expect(createListing(tA, { ...input, placeKey: keyB })).rejects.toThrow(/nơi mình đang ở/);
    await expect(setPropertyLocation(b, pA, { lat: 1, lng: 1 })).rejects.toThrow();
    await setPropertyLocation(a, pA, { lat: 10.7731, lng: 106.6991 });
    await setPropertyLocation(b, pB, { lat: 10.8506, lng: 106.7719 });
  });

  it("tìm theo bán kính", async () => {
    const id = await createListing(tA, { kind: "sell", category: "Điện tử", title: "Quạt đứng", price: 150_000, contact: "0901234567", placeKey: keyA });
    await createListing(tB, { kind: "give", category: "Đồ gia dụng", title: "Tặng nồi cơm", price: 99, contact: "zalo 0911", placeKey: keyB });
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const near = await searchListings(tB, centerA, 3);
    expect(near.map((l) => l.title)).toEqual(["Quạt đứng"]);
    expect(near[0]!.distanceKm).toBeLessThan(0.5);
    expect(near[0]!.authorName).toBe("An");
    const far = await searchListings(tB, centerA, 20);
    expect(far.map((l) => l.title).sort()).toEqual(["Quạt đứng", "Tặng nồi cơm"]);
    expect(far.find((l) => l.kind === "give")!.price).toBeNull();
    expect((await searchListings(tB, centerA, 20, { kind: "give" })).map((l) => l.title)).toEqual(["Tặng nồi cơm"]);
    expect((await searchListings(tB, centerA, 20, { category: "Điện tử" })).map((l) => l.title)).toEqual(["Quạt đứng"]);
    expect((await searchListings(tB, centerA, 20, { q: "nồi" })).map((l) => l.title)).toEqual(["Tặng nồi cơm"]);
    expect(await searchListings(tB, centerA, 20, { q: "100%_" })).toEqual([]);
    // Tọa độ lưu đã làm mờ.
    const [raw] = await withUser(tA, (tx) => tx.select().from(s.listings).where(eq(s.listings.id, id)));
    expect(raw!.lat).toBe(10.775);
  });

  it("lọc tin mới trong 24 giờ và tin của một người đăng", async () => {
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const old = await createListing(tA2, { kind: "service", category: "Sửa chữa", title: "Nhận sửa quạt", contact: "0901112223", placeKey: keyA });
    await withUser(tA2, (tx) => tx.update(s.listings).set({ createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) }).where(eq(s.listings.id, old)));
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const fresh = await searchListings(tB, centerA, 20, { since });
    expect(fresh.map((l) => l.id)).not.toContain(old);
    expect(fresh.length).toBeGreaterThan(0);

    const byAuthor = await searchListings(tB, centerA, 20, { authorId: tA2 });
    expect(byAuthor.map((l) => [l.title, l.authorId])).toEqual([["Nhận sửa quạt", tA2]]);
    // Ngoài bán kính của người xem thì không thấy tin của người đó.
    expect(await searchListings(tB, { lat: 21.03, lng: 105.85 }, 20, { authorId: tA2 })).toEqual([]);
    await closeListing(tA2, old);
    expect(await searchListings(tB, centerA, 20, { authorId: tA2 })).toEqual([]);
  });

  it("liên hệ chỉ lộ khi người đăng đồng ý", async () => {
    const id = await createListing(tA, { kind: "sell", category: "Xe cộ", title: "Xe đạp", price: 500_000, contact: "0909000111", placeKey: keyA });
    expect((await getListing(tA, id, null))!.contact).toBe("0909000111");
    expect((await getListing(tB, id, null))!.contact).toBeNull();
    // Đọc thẳng bảng liên hệ cũng bị RLS chặn.
    expect(await withUser(tB, (tx) => tx.select().from(s.listingContacts).where(eq(s.listingContacts.listingId, id)))).toEqual([]);

    await expect(expressInterest(tA, id, "0909")).rejects.toThrow();
    await expect(expressInterest(tA, id, "0909000111")).rejects.toThrow(/tin của bạn/);
    sent.length = 0;
    await expressInterest(tB, id, "0988777666", "Còn không bạn?");
    expect(sent.map((m) => m.title)).toEqual(["Có người quan tâm tin của bạn"]);
    await expect(expressInterest(tB, id, "0988777666")).rejects.toThrow(/đã bấm quan tâm/);

    // Người thứ ba không thấy lượt quan tâm của người khác.
    expect((await getListing(tA2, id, null))!.interests).toEqual([]);
    expect(await withUser(tA2, (tx) => tx.select().from(s.listingInterests))).toEqual([]);

    const detail = (await getListing(tA, id, null))!;
    expect(detail.interests.map((i) => [i.name, i.contact])).toEqual([["Bảo", "0988777666"]]);
    await expect(decideInterest(tB, detail.interests[0]!.id, true)).rejects.toThrow(/không có quyền/);
    await decideInterest(tA, detail.interests[0]!.id, true);
    expect((await getListing(tB, id, null))!.contact).toBe("0909000111");
    expect((await getListing(tB, id, null))!.myInterest!.status).toBe("accepted");
    expect((await getListing(tA2, id, null))!.contact).toBeNull();
    expect((await myInterests(tB)).map((x) => [x.listing.title, x.status])).toEqual([["Xe đạp", "accepted"]]);
  });

  it("RLS: không sửa, đóng hay đăng thay người khác", async () => {
    const id = await createListing(tA, { kind: "service", category: "Sửa chữa", title: "Sửa điện nước", price: null, contact: "0909000222", placeKey: keyA });
    await expect(closeListing(tB, id)).rejects.toThrow(/không có quyền/);
    const upd = await withUser(tB, (tx) => tx.update(s.listings).set({ title: "hack" }).where(eq(s.listings.id, id)).returning());
    expect(upd).toEqual([]);
    await expect(
      withUser(tB, (tx) => tx.insert(s.listings).values({ authorUserId: tA, kind: "sell", category: "Khác", title: "giả", lat: 0, lng: 0, areaLabel: "x" })),
    ).rejects.toThrow();
    await expect(withUser(tB, (tx) => tx.insert(s.listingContacts).values({ listingId: id, contact: "lừa đảo" }))).rejects.toThrow();
    // Không đăng nhập (không có app.user_id) thì không thấy gì.
    expect(await getDb().select().from(s.listings)).toEqual([]);
    // Người đăng không xóa được tin (không có policy DELETE).
    expect(await withUser(tA, (tx) => tx.delete(s.listings).where(eq(s.listings.id, id)).returning())).toEqual([]);
    await closeListing(tA, id);
    await expect(expressInterest(tB, id, "0988777666")).rejects.toThrow(/đã đóng/);
    expect((await myListings(tA)).find((l) => l.id === id)!.status).toBe("closed");
  });

  it("3 báo cáo thì tin bị ẩn; người đăng không tự gỡ ẩn", async () => {
    const id = await createListing(tA, { kind: "sell", category: "Khác", title: "Tin rác", price: 1, contact: "0909000333", placeKey: keyA });
    await expect(reportListing(tA, id, "tự báo")).rejects.toThrow();
    await reportListing(tB, id, "lừa đảo");
    await expect(reportListing(tB, id, "lừa đảo")).rejects.toThrow(/đã báo cáo/);
    await reportListing(tA2, id, "spam");
    expect(await getListing(tB, id, null)).not.toBeNull();
    await reportListing(b.userId, id, "spam");
    expect(await getListing(tB, id, null)).toBeNull();
    const mine = (await getListing(tA, id, null))!;
    expect(mine.hidden).toBe(true);
    await expect(withUser(tA, (tx) => tx.update(s.listings).set({ hiddenAt: null }).where(eq(s.listings.id, id)))).rejects.toThrow();
    // Báo cáo của người khác không đọc được.
    expect((await withUser(tB, (tx) => tx.select().from(s.listingReports))).length).toBe(1);
    expect(await withUser(tA, (tx) => tx.select({ n: sql<number>`count(*)` }).from(s.listingReports))).toEqual([{ n: "0" }]);
  });
});
