// Kiểm thử báo sự cố trên Postgres thật: người thuê chỉ báo/xem phòng mình, nhân viên chỉ cơ sở
// được giao, chủ trọ khác không thấy gì, trạng thái cuối không đổi được, thông báo đúng người.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import {
  createMaintenanceRequest,
  openMaintenanceCount,
  propertyMaintenanceRequests,
  reportablePlaces,
  tenantMaintenanceRequests,
  updateMaintenanceStatus,
} from "./maintenance";
import { saveSubscription, setPushSenderForTests, type PushMessage } from "./push";
import { createLease, createProperty, importUnits, moveOut } from "./setup";
import { acceptStaffInvite, createStaffInvite } from "./staff";
import { acceptTenantInvite, createTenantInvite } from "./tenant";

const sent: Array<{ endpoint: string; msg: PushMessage }> = [];
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

describe("báo sự cố", () => {
  let a: Actor;
  let b: Actor;
  let staff1: Actor;
  let p1: string;
  let p2: string;
  let lease101: string;
  let lease102: string;
  let leaseP2: string;
  let t101: string;
  let t102: string;

  beforeAll(async () => {
    setPushSenderForTests(async (sub, msg) => {
      sent.push({ endpoint: sub.endpoint, msg });
      return "ok";
    });
    a = await newOwner("sc");
    b = await newOwner("sc-khac");
    p1 = await createProperty(a, { name: "Dãy SC1" });
    p2 = await createProperty(a, { name: "Dãy SC2" });
    await importUnits(a, p1, [{ code: "101" }, { code: "102" }], []);
    await importUnits(a, p2, [{ code: "201" }], []);
    const us = await withOrg(a, (tx) => tx.select().from(s.units));
    const unit = (c: string) => us.find((u) => u.code === c)!.id;
    const lease = (code: string, name: string) =>
      createLease(a, { unitId: unit(code), tenant: { fullName: name }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 1_000_000 });
    lease101 = await lease("101", "Bình");
    lease102 = await lease("102", "Chi");
    leaseP2 = await lease("201", "Dũng");
    t101 = await acceptTenantInvite((await createTenantInvite(a, lease101)).token, { phone: phone(), password: "abcdef12" });
    t102 = await acceptTenantInvite((await createTenantInvite(a, lease102)).token, { phone: phone(), password: "abcdef12" });
    const staffUser = await acceptStaffInvite((await createStaffInvite(a, p2)).token, {
      email: `nv-${randomUUID().slice(0, 8)}@example.com`,
      password: "matkhau123",
      displayName: "NV dãy 2",
    });
    staff1 = (await actorFor(staffUser))!;
    await saveSubscription(a.userId, { endpoint: "https://push.example/owner", p256dh: "k", auth: "a" });
    await saveSubscription(staffUser, { endpoint: "https://push.example/staff2", p256dh: "k", auth: "a" });
    await saveSubscription(t101, { endpoint: "https://push.example/t101", p256dh: "k", auth: "a" });
  });

  afterAll(() => setPushSenderForTests(null));

  it("người thuê báo sự cố phòng mình; chủ trọ nhận thông báo, nhân viên cơ sở khác thì không", async () => {
    const places = await reportablePlaces(t101);
    expect(places.map((p) => p.unitCode)).toEqual(["101"]);
    sent.length = 0;
    await createMaintenanceRequest(t101, lease101, { title: "Vòi nước rỉ", body: "Nhà tắm", urgent: true });
    expect(sent.map((x) => x.endpoint)).toEqual(["https://push.example/owner"]);
    expect(sent[0]!.msg.title).toMatch(/GẤP/);
    expect(sent[0]!.msg.url).toBe(`/co-so/${p1}/su-co`);

    await expect(createMaintenanceRequest(t101, lease102, { title: "Phòng người khác" })).rejects.toThrow(/không còn ở/);
    await expect(createMaintenanceRequest(t101, lease101, { title: "  " })).rejects.toThrow(/Cần nhập/);
  });

  it("người thuê chỉ thấy yêu cầu của mình", async () => {
    await createMaintenanceRequest(t102, lease102, { title: "Bóng đèn cháy" });
    expect((await tenantMaintenanceRequests(t101)).map((r) => r.title)).toEqual(["Vòi nước rỉ"]);
    expect((await tenantMaintenanceRequests(t102)).map((r) => r.title)).toEqual(["Bóng đèn cháy"]);
  });

  it("chủ trọ thấy theo cơ sở, gấp lên trước; nhân viên không được giao cơ sở thì bị chặn; chủ trọ khác không thấy", async () => {
    const list = await propertyMaintenanceRequests(a, p1);
    expect(list.map((r) => r.title)).toEqual(["Vòi nước rỉ", "Bóng đèn cháy"]);
    expect(await openMaintenanceCount(a, p1)).toBe(2);
    await expect(propertyMaintenanceRequests(staff1, p1)).rejects.toThrow(/quyền/);
    expect(await propertyMaintenanceRequests(staff1, p2)).toEqual([]);
    await expect(propertyMaintenanceRequests(b, p1)).rejects.toThrow(/Không tìm thấy/);
    // RLS: chủ trọ khác đọc thẳng bảng cũng không thấy dòng nào của A.
    const raw = await withOrg(b, (tx) => tx.select().from(s.maintenanceRequests));
    expect(raw).toEqual([]);
    const [u101] = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.code, "101")));
    const forged = withOrg(b, (tx) =>
      tx.insert(s.maintenanceRequests).values({
        orgId: a.orgId, propertyId: p1, unitId: u101!.id, leaseId: lease101, createdBy: b.userId, title: "giả",
      }),
    );
    await expect(forged).rejects.toSatisfy((e: unknown) => /row-level security/.test(String((e as { cause?: unknown }).cause ?? e)));
  });

  it("đổi trạng thái: từ chối cần lý do, trạng thái cuối không đổi được, người thuê được báo", async () => {
    const [req] = (await propertyMaintenanceRequests(a, p1)).filter((r) => r.title === "Vòi nước rỉ");
    await expect(updateMaintenanceStatus(staff1, req!.id, "in_progress")).rejects.toThrow(/quyền/);
    await expect(updateMaintenanceStatus(b, req!.id, "in_progress")).rejects.toThrow(/Không tìm thấy/);
    await expect(updateMaintenanceStatus(a, req!.id, "rejected")).rejects.toThrow(/lý do/);

    sent.length = 0;
    await updateMaintenanceStatus(a, req!.id, "in_progress");
    await updateMaintenanceStatus(a, req!.id, "done", "Đã thay vòi mới");
    expect(sent.map((x) => x.endpoint)).toEqual(["https://push.example/t101", "https://push.example/t101"]);
    expect(sent[1]!.msg.body).toMatch(/thay vòi/);
    await expect(updateMaintenanceStatus(a, req!.id, "open")).rejects.toThrow(/Không chuyển được/);

    const [mine] = await tenantMaintenanceRequests(t101);
    expect(mine!.status).toBe("done");
    expect(mine!.resolutionNote).toBe("Đã thay vòi mới");
    expect(await openMaintenanceCount(a, p1)).toBe(1);
  });

  it("nhân viên xử lý được yêu cầu ở cơ sở được giao; người đã chuyển đi không báo được nữa", async () => {
    const tP2 = await acceptTenantInvite((await createTenantInvite(a, leaseP2)).token, { phone: phone(), password: "abcdef12" });
    const id = await createMaintenanceRequest(tP2, leaseP2, { title: "Cửa kẹt" });
    await updateMaintenanceStatus(staff1, id, "done");
    await moveOut(a, leaseP2, "2026-02-01");
    expect(await reportablePlaces(tP2)).toEqual([]);
    await expect(createMaintenanceRequest(tP2, leaseP2, { title: "Lại hỏng" })).rejects.toThrow(/không còn ở/);
    // Lịch sử vẫn còn cho người thuê cũ.
    expect((await tenantMaintenanceRequests(tP2)).map((r) => r.status)).toEqual(["done"]);
  });
});
