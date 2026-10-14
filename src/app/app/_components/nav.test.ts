import { describe, expect, it } from "vitest";
import { isActive, TABS } from "./nav";

const activeLabel = (path: string) => TABS.filter((t) => isActive(t, path)).map((t) => t.label);

describe("điều hướng chính", () => {
  it("mỗi trang tô sáng đúng một tab", () => {
    expect(activeLabel("/app")).toEqual(["Hôm nay"]);
    expect(activeLabel("/app/quanh-day")).toEqual(["Quanh đây"]);
    expect(activeLabel("/app/tin/abc")).toEqual(["Quanh đây"]);
    expect(activeLabel("/app/dang-tin")).toEqual(["Đăng tin"]);
    expect(activeLabel("/app/su-co")).toEqual(["Tiện ích"]);
    expect(activeLabel("/app/bang-tin")).toEqual(["Tiện ích"]);
    expect(activeLabel("/app/nha")).toEqual(["Tôi"]);
    expect(activeLabel("/app/hoa-don/123")).toEqual(["Tôi"]);
    expect(activeLabel("/app/cua-toi")).toEqual(["Tôi"]);
  });

  it("không nhầm tiền tố tên trang", () => {
    expect(activeLabel("/app/toi-khac")).toEqual([]);
  });
});
