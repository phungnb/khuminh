import { describe, expect, it } from "vitest";
import { deriveFloor, floorLabel, groupRoomsByFloor, roomStatus } from "./rooms";

describe("deriveFloor", () => {
  it("cột floor thắng mã phòng", () => {
    expect(deriveFloor("101", 3)).toBe(3);
    expect(deriveFloor("101", 0)).toBe(0);
  });
  it("suy từ mã dạng 101, 1203", () => {
    expect(deriveFloor("101", null)).toBe(1);
    expect(deriveFloor("1203", null)).toBe(12);
  });
  it("mã không theo quy ước thì chưa xếp tầng", () => {
    expect(deriveFloor("12", null)).toBeNull();
    expect(deriveFloor("A1", null)).toBeNull();
    expect(deriveFloor("", null)).toBeNull();
  });
});

describe("floorLabel", () => {
  it("0 là tầng trệt", () => {
    expect(floorLabel(0)).toBe("Tầng trệt");
    expect(floorLabel(2)).toBe("Tầng 2");
    expect(floorLabel(null)).toBe("Chưa xếp tầng");
  });
});

describe("groupRoomsByFloor", () => {
  it("tầng tăng dần, chưa xếp tầng ở cuối, giữ thứ tự trong tầng", () => {
    const rooms = [
      { code: "201", floor: null },
      { code: "101", floor: null },
      { code: "P1", floor: null },
      { code: "102", floor: null },
    ];
    const groups = groupRoomsByFloor(rooms);
    expect(groups.map((g) => g.floor)).toEqual([1, 2, null]);
    expect(groups[0]!.rooms.map((r) => r.code)).toEqual(["101", "102"]);
  });
});

describe("roomStatus", () => {
  it("ưu tiên nợ trên hết hạn", () => {
    expect(roomStatus({ lease: { expiresOn: "2026-01-01" }, overdue: true }, "2026-10-30", 30)).toBe("no");
  });
  it("hết hạn rồi sắp hết hạn rồi đang thuê rồi trống", () => {
    expect(roomStatus({ lease: { expiresOn: "2026-10-01" }, overdue: false }, "2026-10-30", 30)).toBe("het-han");
    expect(roomStatus({ lease: { expiresOn: "2026-11-15" }, overdue: false }, "2026-10-30", 30)).toBe("sap-het-han");
    expect(roomStatus({ lease: { expiresOn: "2027-01-01" }, overdue: false }, "2026-10-30", 30)).toBe("thue");
    expect(roomStatus({ lease: { expiresOn: null }, overdue: false }, "2026-10-30", 30)).toBe("thue");
    expect(roomStatus({ lease: null, overdue: false }, "2026-10-30", 30)).toBe("trong");
  });
});
