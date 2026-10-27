// Kiểm thử chợ tiện ích quanh đây trên Postgres thật: bán kính, quan tâm/lộ liên hệ, báo cáo, RLS.

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, withOrg, withUser } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import {
  addListingPhotos,
  closeListing,
  createListing,
  decideInterest,
  deleteListing,
  expressInterest,
  getListing,
  getListingImage,
  markSoldListing,
  marketPlaces,
  myInterests,
  myListings,
  removeListingPhoto,
  renewListing,
  reopenListing,
  reportListing,
  searchListings,
  sellerInterestInbox,
  sellerShop,
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
    // Người khác xoá tin không được (policy DELETE chỉ cho tác giả).
    expect(await withUser(tB, (tx) => tx.delete(s.listings).where(eq(s.listings.id, id)).returning())).toEqual([]);
    await expect(deleteListing(tB, id)).rejects.toThrow(/không có quyền/);
    await closeListing(tA, id);
    await expect(expressInterest(tB, id, "0988777666")).rejects.toThrow(/đã đóng/);
    expect((await myListings(tA)).find((l) => l.id === id)!.status).toBe("closed");
    // Người đăng xoá hẳn được tin của mình.
    await deleteListing(tA, id);
    expect(await getListing(tA, id, null)).toBeNull();
    expect((await myListings(tA)).find((l) => l.id === id)).toBeUndefined();
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

  it("vòng đời tin: hết hạn thì khuất khỏi chợ, gia hạn và mở lại được", async () => {
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const id = await createListing(tA, { kind: "sell", category: "Đồ gia dụng", title: "Bàn học gấp", price: 90_000, contact: "0909000444", placeKey: keyA });
    const mine0 = (await myListings(tA)).find((l) => l.id === id)!;
    expect(mine0.expired).toBe(false);
    const ttlMs = mine0.expiresAt.getTime() - mine0.createdAt.getTime();
    expect(ttlMs).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect(ttlMs).toBeLessThan(31 * 24 * 3600 * 1000);
    expect((await searchListings(tB, centerA, 20)).map((l) => l.id)).toContain(id);
    // Còn hạn dài thì chưa cho gia hạn.
    await expect(renewListing(tA, id)).rejects.toThrow(/chưa cần gia hạn/);
    // Ép hết hạn: tin biến khỏi chợ nhưng người đăng vẫn thấy ở trạng thái hết hạn.
    await withUser(tA, (tx) => tx.update(s.listings).set({ expiresAt: new Date(Date.now() - 3600 * 1000) }).where(eq(s.listings.id, id)));
    expect((await searchListings(tB, centerA, 20)).map((l) => l.id)).not.toContain(id);
    expect((await myListings(tA)).find((l) => l.id === id)!.expired).toBe(true);
    await expect(renewListing(tB, id)).rejects.toThrow(/không có quyền/);
    await renewListing(tA, id);
    expect((await myListings(tA)).find((l) => l.id === id)!.expired).toBe(false);
    expect((await searchListings(tB, centerA, 20)).map((l) => l.id)).toContain(id);
    // Đóng rồi thì gia hạn bị từ chối; mở lại thì hạn tính lại 30 ngày.
    await closeListing(tA, id);
    await expect(renewListing(tA, id)).rejects.toThrow(/đã đóng/);
    await reopenListing(tA, id);
    const re = (await myListings(tA)).find((l) => l.id === id)!;
    expect(re.status).toBe("open");
    expect(re.expired).toBe(false);
  });

  it("gian hàng: đang bán, đã bán gần đây, ngoài bán kính thì trống", async () => {
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const openId = await createListing(tA2, { kind: "sell", category: "Khác", title: "Ghế nhựa", price: 50_000, contact: "0909000555", placeKey: keyA });
    const soldId = await createListing(tA2, { kind: "sell", category: "Khác", title: "Ấm siêu tốc", price: 70_000, contact: "0909000555", placeKey: keyA });
    await markSoldListing(tA2, soldId);
    const closedId = await createListing(tA2, { kind: "sell", category: "Khác", title: "Nồi cũ", price: 30_000, contact: "0909000555", placeKey: keyA });
    await closeListing(tA2, closedId);
    const shop = (await sellerShop(tB, tA2, centerA, 20))!;
    expect(shop.name).toBe("Ánh");
    expect(shop.open.map((l) => l.id)).toContain(openId);
    expect(shop.open.map((l) => l.id)).not.toContain(soldId);
    expect(shop.sold.map((l) => l.id)).toContain(soldId);
    // Chỉ đóng (không bấm đã bán) thì không lọt vào mục đã bán.
    expect(shop.sold.map((l) => l.id)).not.toContain(closedId);
    expect(shop.soldCount).toBeGreaterThanOrEqual(1);
    const far = (await sellerShop(tB, tA2, { lat: 21.03, lng: 105.85 }, 20))!;
    expect(far.open).toEqual([]);
    expect(far.soldCount).toBe(0);
    expect(await sellerShop(tB, randomUUID(), centerA, 20)).toBeNull();
  });

  it("ảnh tin: bìa, xem, thêm/xoá chỉ người đăng, xoá tin thì ảnh mất theo", async () => {
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const px = (n: number) => ({ contentType: "image/jpeg", data: new Uint8Array([n, n, n]) });
    const id = await createListing(tA, {
      kind: "sell",
      category: "Điện tử",
      title: "Tủ lạnh mini",
      price: 800_000,
      contact: "0909000666",
      placeKey: keyA,
      photos: [px(1), px(2)],
    });
    // Ảnh bìa trên thẻ tin + danh sách ảnh ở chi tiết, đúng thứ tự.
    const found = (await searchListings(tB, centerA, 20)).find((l) => l.id === id)!;
    const detail = (await getListing(tB, id, centerA))!;
    expect(detail.imageIds).toHaveLength(2);
    expect(found.coverImageId).toBe(detail.imageIds[0]);
    // Người khác xem được nội dung ảnh của tin đang mở.
    const img = await getListingImage(tB, detail.imageIds[0]!);
    expect(img!.contentType).toBe("image/jpeg");
    expect([...img!.data]).toEqual([1, 1, 1]);
    // Người không phải người đăng không thêm/xoá ảnh được.
    await expect(addListingPhotos(tB, id, [px(3)])).rejects.toThrow(/không có quyền/);
    await expect(removeListingPhoto(tB, id, detail.imageIds[0]!)).rejects.toThrow(/không có quyền/);
    // Người đăng thêm tới giới hạn 6 thì bị chặn; loại ảnh lạ và ảnh quá lớn bị chặn.
    await addListingPhotos(tA, id, [px(3), px(4), px(5), px(6)]);
    await expect(addListingPhotos(tA, id, [px(7)])).rejects.toThrow(/tối đa 6/);
    await expect(
      createListing(tA, {
        kind: "sell",
        category: "Khác",
        title: "Ảnh gif",
        contact: "0909000666",
        placeKey: keyA,
        photos: [{ contentType: "image/gif", data: new Uint8Array([1]) }],
      }),
    ).rejects.toThrow(/JPEG, PNG hoặc WebP/);
    await expect(addListingPhotos(tA, id, [{ contentType: "image/png", data: new Uint8Array(1_000_001) }])).rejects.toThrow(/tối đa 1 MB/);
    // Xoá một ảnh, rồi xoá hẳn tin thì ảnh còn lại mất theo (cascade).
    const after = (await getListing(tA, id, centerA))!;
    expect(after.imageIds).toHaveLength(6);
    await removeListingPhoto(tA, id, after.imageIds[0]!);
    expect((await getListing(tA, id, centerA))!.imageIds).toHaveLength(5);
    await deleteListing(tA, id);
    expect(await getListingImage(tA, after.imageIds[1]!)).toBeNull();
  });

  it("đánh dấu đã bán: rời feed, hiện ở gian hàng với ngày bán, không mở lại/gia hạn/đóng lại/quan tâm được", async () => {
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const id = await createListing(tA, { kind: "sell", category: "Điện tử", title: "Loa bluetooth", price: 300_000, contact: "0909000777", placeKey: keyA });
    await expect(markSoldListing(tB, id)).rejects.toThrow(/không có quyền/);
    await markSoldListing(tA, id);
    const detail = (await getListing(tA, id, centerA))!;
    expect(detail.status).toBe("closed");
    expect(detail.soldAt).not.toBeNull();
    expect((await searchListings(tB, centerA, 20)).map((l) => l.id)).not.toContain(id);
    const shop = (await sellerShop(tB, tA, centerA, 20))!;
    expect(shop.sold.map((l) => l.id)).toContain(id);
    expect(shop.soldCount).toBeGreaterThanOrEqual(1);
    await expect(markSoldListing(tA, id)).rejects.toThrow(/đã bán rồi/);
    await expect(reopenListing(tA, id)).rejects.toThrow(/đã bán/);
    await expect(renewListing(tA, id)).rejects.toThrow(/đã bán/);
    await expect(closeListing(tA, id)).rejects.toThrow(/đã bán/);
    await expect(expressInterest(tB, id, "0901111222")).rejects.toThrow(/đã bán/);
  });

  it("quan tâm kèm câu hỏi nhanh + trả giá, hộp thư người bán gom theo tin", async () => {
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const id = await createListing(tA, { kind: "sell", category: "Đồ gia dụng", title: "Bàn gỗ", price: 500_000, contact: "0909000888", placeKey: keyA });
    await expect(expressInterest(tB, id, "0901111333", "Còn không?", -1)).rejects.toThrow(/không hợp lệ/);
    await expressInterest(tB, id, "0901111333", "Còn không?", 400_000);
    const detail = (await getListing(tA, id, centerA))!;
    expect(detail.interests).toHaveLength(1);
    expect(detail.interests[0]!.note).toBe("Còn không?");
    expect(detail.interests[0]!.offerPrice).toBe(400_000);
    const inbox = await sellerInterestInbox(tA);
    const group = inbox.find((g) => g.listing.id === id)!;
    expect(group.interests[0]!.offerPrice).toBe(400_000);
    await expect(expressInterest(tB, id, "0901111333")).rejects.toThrow(/đã bấm quan tâm/);
  });

  it("hồ sơ người bán mini: số tin đã bán + hoạt động gần nhất từ phiên đăng nhập", async () => {
    const centerA = { lat: 10.7731, lng: 106.6991 };
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    await getDb().insert(s.sessions).values({
      userId: tA,
      tokenHash: `test-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 86400 * 1000),
      createdAt: twoHoursAgo,
    });
    const before = (await sellerShop(tB, tA, centerA, 20))!.soldCount;
    const soldId = await createListing(tA, { kind: "sell", category: "Khác", title: "Ghế gấp", price: 100_000, contact: "0909000999", placeKey: keyA });
    await markSoldListing(tA, soldId);
    const after = (await sellerShop(tB, tA, centerA, 20))!;
    expect(after.soldCount).toBe(before + 1);
    const openId = await createListing(tA, { kind: "sell", category: "Khác", title: "Kệ sách", price: 200_000, contact: "0909000999", placeKey: keyA });
    const row = (await searchListings(tB, centerA, 20)).find((l) => l.id === openId)!;
    expect(row.sellerSoldCount).toBe(after.soldCount);
    expect(row.sellerLastActiveAt).not.toBeNull();
    // Lấy max phiên đăng nhập nên không cũ hơn phiên vừa chèn (có thể mới hơn nếu tài khoản đã có phiên khác).
    expect(row.sellerLastActiveAt!.getTime()).toBeGreaterThanOrEqual(twoHoursAgo.getTime() - 5000);
  });
});
