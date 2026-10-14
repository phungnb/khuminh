import { describe, expect, it } from "vitest";
import { CATEGORIES, LISTING_KIND_LABEL } from "@/server/market";
import { postHref, purposeOf, PURPOSES } from "./purposes";

describe("nhu cầu quanh đây", () => {
  it("mọi nhu cầu dùng loại tin và danh mục có thật", () => {
    for (const p of PURPOSES) {
      expect(p.kind in LISTING_KIND_LABEL).toBe(true);
      if (p.category) expect((CATEGORIES as readonly string[]).includes(p.category)).toBe(true);
    }
  });

  it("nhận đúng nhu cầu từ bộ lọc", () => {
    expect(purposeOf(undefined, undefined)).toBeUndefined();
    expect(purposeOf("sell", "Điện tử")?.key).toBe("mua-ban");
    expect(purposeOf("service", "Sửa chữa")?.key).toBe("sua-chua");
    expect(purposeOf("service", "Dọn dẹp, giặt ủi")?.key).toBe("don-dep");
    expect(purposeOf("service", "Học tập")?.key).toBe("dich-vu");
    expect(purposeOf("service", undefined)?.key).toBe("dich-vu");
  });

  it("link đăng tin điền sẵn loại và danh mục", () => {
    const sua = PURPOSES.find((p) => p.key === "sua-chua")!;
    const url = new URL(postHref(sua), "http://x");
    expect(url.pathname).toBe("/app/dang-tin");
    expect(url.searchParams.get("k")).toBe("service");
    expect(url.searchParams.get("c")).toBe("Sửa chữa");
  });
});
