"use server";

import { runAction } from "@/lib/action";
import { parseMoney } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { UserError } from "@/server/audit";
import {
  addListingPhotos,
  closeListing,
  createListing,
  decideInterest,
  deleteListing,
  expressInterest,
  removeListingPhoto,
  renewListing,
  reopenListing,
  reportListing,
  type ListingKind,
  type PhotoInput,
} from "@/server/market";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Ảnh từ ô ẩn "photos": JSON các data URL do ListingPhotoPicker đã nén phía client. */
function photosFrom(f: FormData): PhotoInput[] {
  const raw = str(f, "photos");
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new UserError("Ảnh không hợp lệ");
  }
  if (!Array.isArray(arr)) throw new UserError("Ảnh không hợp lệ");
  return arr.map((d) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(d));
    if (!m) throw new UserError("Ảnh không hợp lệ");
    return { contentType: m[1]!, data: new Uint8Array(Buffer.from(m[2]!, "base64")) };
  });
}

/** Trang quay về sau thao tác vòng đời tin; chỉ nhận đường nội bộ dưới /app để tránh nhảy trang lạ. */
const back = (f: FormData, fallback: string) => {
  const b = str(f, "back");
  return b.startsWith("/app/") ? b : fallback;
};

export async function createListingAction(f: FormData) {
  const user = await requireUser();
  await runAction("/app/dang-tin", async () => {
    const kind = str(f, "kind") as ListingKind;
    let price: number | null = null;
    if (kind !== "give" && str(f, "price")) {
      price = parseMoney(f.get("price"));
      if (Number.isNaN(price)) throw new UserError("Giá phải là số nguyên đồng");
    }
    const id = await createListing(user.id, {
      kind,
      category: str(f, "category"),
      title: str(f, "title"),
      body: str(f, "body"),
      price,
      contact: str(f, "contact"),
      placeKey: str(f, "place"),
      photos: photosFrom(f),
    });
    return `/app/tin/${id}`;
  }, "Đã đăng tin");
}

export async function interestAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(`/app/tin/${id}`, () => expressInterest(user.id, id, str(f, "contact"), str(f, "note")), "Đã gửi. Người đăng sẽ xem và đồng ý chia sẻ liên hệ.");
}

export async function decideInterestAction(f: FormData) {
  const user = await requireUser();
  const accept = str(f, "decision") === "accept";
  await runAction(`/app/tin/${str(f, "listingId")}`, async () => {
    await decideInterest(user.id, str(f, "interestId"), accept);
  }, accept ? "Đã đồng ý, hai bên thấy liên hệ của nhau" : "Đã từ chối");
}

export async function closeListingAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(back(f, `/app/tin/${id}`), () => closeListing(user.id, id), "Đã đóng tin");
}

export async function renewListingAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(back(f, "/app/cua-toi"), () => renewListing(user.id, id), "Đã gia hạn thêm 30 ngày");
}

export async function reopenListingAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(back(f, "/app/cua-toi"), () => reopenListing(user.id, id), "Đã mở lại tin, hạn hiển thị tính lại 30 ngày");
}

export async function deleteListingAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(back(f, "/app/cua-toi"), () => deleteListing(user.id, id), "Đã xoá hẳn tin");
}

export async function addPhotosAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(back(f, `/app/tin/${id}`), () => addListingPhotos(user.id, id, photosFrom(f)), "Đã thêm ảnh");
}

export async function removePhotoAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(back(f, `/app/tin/${id}`), () => removeListingPhoto(user.id, id, str(f, "imageId")), "Đã xoá ảnh");
}

export async function reportListingAction(f: FormData) {
  const user = await requireUser();
  const id = str(f, "listingId");
  await runAction(`/app/tin/${id}`, () => reportListing(user.id, id, str(f, "reason")), "Đã gửi báo cáo");
}
