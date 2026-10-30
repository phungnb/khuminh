// Tính khoảng cách và đọc tọa độ cho "chợ quanh đây". Không cần PostGIS:
// lọc thô theo khung tọa độ rồi lọc chính xác bằng công thức haversine.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Khung tọa độ bao quanh vòng tròn bán kính `km` (luôn rộng hơn vòng tròn). */
export function boundingBox(c: LatLng, km: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = (km / EARTH_KM) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(rad(c.lat)), 0.01);
  return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLng: c.lng - dLng, maxLng: c.lng + dLng };
}

/** Làm tròn ~500 m (0,005°) để tin đăng không lộ vị trí chính xác. */
export function blur(c: LatLng): LatLng {
  const r = (x: number) => Math.round(x / 0.005) * 0.005;
  return { lat: Number(r(c.lat).toFixed(3)), lng: Number(r(c.lng).toFixed(3)) };
}

export const RADII_KM = [1, 3, 5, 10, 20] as const;
export const DEFAULT_RADIUS_KM = 3;

export function parseRadius(v: string | undefined): number {
  const n = Number(v);
  return (RADII_KM as readonly number[]).includes(n) ? n : DEFAULT_RADIUS_KM;
}

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Đọc tọa độ từ "10.77, 106.70" hoặc link Google Maps đầy đủ
 * (dạng .../@10.77,106.70,17z, ?q=10.77,106.70, ?ll=..., !3d10.77!4d106.70).
 * Link rút gọn (maps.app.goo.gl) không chứa tọa độ nên trả về null.
 */
export function parseLocation(input: string): LatLng | null {
  const s = decodeURIComponent(input.trim());
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|ll|query|destination)=${num},\\s*${num}`),
    new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`),
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return valid(Number(m[1]), Number(m[2]));
  }
  return null;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m`;
  return `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

/** Cookie nhớ bán kính người dùng chọn ở Quanh đây; Hôm nay dùng chung. */
export const RADIUS_COOKIE = "km_r";
