import { describe, expect, it } from "vitest";
import { divRound, roundTo } from "./money";
import { daysInclusive, toDayNumber } from "./dates";

describe("divRound", () => {
  it("làm tròn nửa lên", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(3_000_000 * 17, 31)).toBe(1_645_161);
  });
  it("từ chối số thực", () => {
    expect(() => divRound(1.5, 2)).toThrow();
    expect(() => divRound(1, 0)).toThrow();
  });
});

describe("roundTo", () => {
  it("làm tròn tới nghìn", () => {
    expect(roundTo(2_057_257, 1_000)).toBe(2_057_000);
    expect(roundTo(2_057_500, 1_000)).toBe(2_058_000);
    expect(roundTo(123, 1)).toBe(123);
  });
});

describe("dates", () => {
  it("đếm ngày gồm cả hai đầu, có năm nhuận", () => {
    expect(daysInclusive("2026-10-01", "2026-10-31")).toBe(31);
    expect(daysInclusive("2028-02-01", "2028-02-29")).toBe(29);
    expect(daysInclusive("2026-10-02", "2026-10-01")).toBe(0);
  });
  it("ngày không tồn tại là NaN", () => {
    expect(toDayNumber("2026-02-30")).toBeNaN();
  });
});
