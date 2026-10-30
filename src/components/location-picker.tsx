// Chọn vị trí cơ sở: tìm địa chỉ, dùng vị trí hiện tại, hoặc chạm/kéo ghim trên bản đồ.
// Ghi vào ô "location" của form có sẵn nên action lưu vị trí cũ không đổi.
// Vị trí hiện tại chỉ lấy khi người dùng bấm nút (không tự lấy nền).
"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { parseLocation, type LatLng } from "@/lib/geo";

const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => <div className="flex h-72 w-full items-center justify-center rounded-lg border border-border/60 text-sm text-fg-muted">Đang tải bản đồ…</div>,
});

const DEFAULT_CENTER: LatLng = { lat: 10.775, lng: 106.7 };

interface SearchHit {
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationPicker({ defaultLat, defaultLng }: { defaultLat: number | null; defaultLng: number | null }) {
  const initial: LatLng | null = defaultLat !== null && defaultLng !== null ? { lat: defaultLat, lng: defaultLng } : null;
  const [loc, setLoc] = useState<LatLng | null>(initial);
  const [text, setText] = useState(initial ? `${initial.lat}, ${initial.lng}` : "");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoState, setGeoState] = useState<"idle" | "locating" | "error">("idle");
  const [geoError, setGeoError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  function pick(next: LatLng) {
    setLoc(next);
    setText(`${next.lat}, ${next.lng}`);
    setHits([]);
  }

  // Tìm địa chỉ (Nominatim, miễn phí, không cần key), gõ xong 500ms mới gọi.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as SearchHit[];
        setHits(data.filter((h) => h.lat && h.lon));
      } catch {
        if (!ctrl.signal.aborted) setHits([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoState("error");
      setGeoError("Trình duyệt này không hỗ trợ lấy vị trí. Hãy tìm địa chỉ hoặc chạm vào bản đồ.");
      return;
    }
    setGeoState("locating");
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pick({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setGeoState("idle");
      },
      () => {
        setGeoState("error");
        setGeoError("Không lấy được vị trí. Kiểm tra quyền vị trí của trình duyệt rồi thử lại, hoặc tìm địa chỉ / chạm vào bản đồ.");
      },
      { timeout: 10000 },
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="location-search">Tìm địa chỉ</label>
        <input
          className="input"
          id="location-search"
          type="search"
          placeholder="Ví dụ: 123 Nguyễn Văn Linh, Biên Hòa"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          autoComplete="off"
        />
        {searching ? <p className="mt-1 text-sm text-fg-muted">Đang tìm…</p> : null}
        {hits.length ? (
          <ul className="mt-1 divide-y divide-border/60 rounded-lg border border-border/60">
            {hits.map((h) => (
              <li key={`${h.lat},${h.lon}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => pick({ lat: Number(h.lat), lng: Number(h.lon) })}
                >
                  {h.display_name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <LocationMap center={loc ?? DEFAULT_CENTER} marker={loc} onPick={pick} />
        <p className="mt-1 text-sm text-fg-muted">
          {loc ? `Đã chọn: ${loc.lat}, ${loc.lng}. Chạm vào bản đồ hoặc kéo ghim để đổi.` : "Chưa chọn vị trí — chạm vào bản đồ để đặt ghim."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={useMyLocation} disabled={geoState === "locating"}>
          {geoState === "locating" ? "Đang lấy vị trí…" : "Dùng vị trí của tôi"}
        </button>
        {geoState === "error" ? <p className="text-sm text-danger">{geoError}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="location">Tọa độ hoặc link Google Maps</label>
        <input
          className="input"
          id="location"
          name="location"
          placeholder="10.7731, 106.6991"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const parsed = parseLocation(text);
            if (parsed) pick(parsed);
          }}
        />
        <p className="mt-1 text-sm text-fg-muted">Vẫn dán được tọa độ hoặc link Google Maps như trước.</p>
      </div>
    </div>
  );
}
