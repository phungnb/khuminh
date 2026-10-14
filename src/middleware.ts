import { NextResponse, type NextRequest } from "next/server";
import { RADII_KM, RADIUS_COOKIE } from "@/lib/geo";

// Chọn bán kính ở Quanh đây thì nhớ lại (cookie) để Hôm nay và lần mở sau dùng đúng bán kính đó.
// Chỉ là tùy chọn hiển thị, không phải dữ liệu nhạy cảm.
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const r = Number(req.nextUrl.searchParams.get("r"));
  if ((RADII_KM as readonly number[]).includes(r) && req.cookies.get(RADIUS_COOKIE)?.value !== String(r)) {
    res.cookies.set(RADIUS_COOKIE, String(r), { path: "/app", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }
  return res;
}

export const config = { matcher: ["/app/quanh-day"] };
