import { describe, expect, it } from "vitest";
import { blur, boundingBox, distanceKm, formatKm, parseLocation, parseRadius } from "./geo";

const benThanh = { lat: 10.7725, lng: 106.698 };
const landmark81 = { lat: 10.7949, lng: 106.7219 };

describe("geo", () => {
  it("khoảng cách haversine", () => {
    expect(distanceKm(benThanh, benThanh)).toBe(0);
    // Chợ Bến Thành → Landmark 81 khoảng 3,6 km theo đường chim bay.
    expect(distanceKm(benThanh, landmark81)).toBeGreaterThan(3.4);
    expect(distanceKm(benThanh, landmark81)).toBeLessThan(3.8);
  });

  it("khung tọa độ chứa trọn vòng tròn", () => {
    const b = boundingBox(benThanh, 3);
    expect(landmark81.lat).toBeLessThan(b.maxLat);
    expect(benThanh.lat - b.minLat).toBeCloseTo(3 / 111.19, 3);
    expect(b.maxLng - benThanh.lng).toBeGreaterThan(b.maxLat - benThanh.lat);
  });

  it("làm mờ tọa độ không lệch quá ~400 m", () => {
    const p = { lat: 10.77731, lng: 106.69912 };
    const q = blur(p);
    expect(distanceKm(p, q)).toBeLessThan(0.4);
    expect(blur(q)).toEqual(q);
  });

  it("đọc tọa độ và link Google Maps", () => {
    expect(parseLocation("10.7725, 106.698")).toEqual(benThanh);
    expect(parseLocation("https://www.google.com/maps/place/Ch%E1%BB%A3/@10.7725,106.698,17z/data=x")).toEqual(benThanh);
    expect(parseLocation("https://www.google.com/maps/place/X/data=!4m6!3m5!3d10.7725!4d106.698!16s")).toEqual(benThanh);
    expect(parseLocation("https://maps.google.com/?q=10.7725,106.698")).toEqual(benThanh);
    expect(parseLocation("https://maps.app.goo.gl/abc")).toBeNull();
    expect(parseLocation("95, 106")).toBeNull();
    expect(parseLocation("")).toBeNull();
  });

  it("bán kính chỉ nhận giá trị cho phép", () => {
    expect(parseRadius("20")).toBe(20);
    expect(parseRadius("50")).toBe(3);
    expect(parseRadius(undefined)).toBe(3);
  });

  it("hiển thị khoảng cách", () => {
    expect(formatKm(0.04)).toBe("100 m");
    expect(formatKm(0.34)).toBe("300 m");
    expect(formatKm(2.46)).toBe("2,5 km");
    expect(formatKm(14.6)).toBe("15 km");
  });
});
