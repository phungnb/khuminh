// Bản đồ chọn vị trí (Leaflet + OpenStreetMap, không cần key).
// Chỉ tải ở trình duyệt (được nạp bằng next/dynamic ssr:false từ location-picker).
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/geo";

const PIN = L.divIcon({
  className: "",
  html: `<div style="width:26px;height:26px;background:#e5484d;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export default function LocationMap({
  center,
  marker,
  onPick,
}: {
  center: LatLng;
  marker: LatLng | null;
  onPick: (loc: LatLng) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const lastSyncedRef = useRef<string>("");

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: true }).setView([center.lat, center.lng], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      pickRef.current({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đồng bộ ghim theo vị trí đã chọn (từ tìm kiếm / vị trí hiện tại / gõ tay).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      lastSyncedRef.current = "";
      return;
    }
    const key = `${marker.lat},${marker.lng}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;
    if (!markerRef.current) {
      markerRef.current = L.marker([marker.lat, marker.lng], { icon: PIN, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        pickRef.current({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
      });
    } else {
      markerRef.current.setLatLng([marker.lat, marker.lng]);
    }
    map.setView([marker.lat, marker.lng], Math.max(map.getZoom(), 13));
  }, [marker]);

  return <div ref={elRef} className="h-72 w-full rounded-lg border border-border/60" style={{ zIndex: 0 }} />;
}
