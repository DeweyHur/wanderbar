import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import type { RouteResult } from "./google";
import { MARK_COLORS, markColor, markRegion, type MapMark } from "./mapMarks";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** A round pin: the stop's number, 🏨 for a hotel, ★ for one of the group's places. */
function icon(m: MapMark, on: boolean) {
  const size = m.kind === "place" ? (on ? 30 : 24) : on ? 36 : 30;
  const label = m.kind === "stop" ? String(m.n ?? "") : m.kind === "hotel" ? "🏨" : "★";
  const ring = on ? "box-shadow:0 0 0 4px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.5);" : "box-shadow:0 1px 4px rgba(0,0,0,.45);";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${markColor(m)};color:#fff;display:flex;align-items:center;justify-content:center;font:700 ${m.kind === "place" ? 13 : 14}px system-ui,sans-serif;border:2px solid #fff;${ring}">${esc(label)}</div>`,
  });
}

/**
 * Web: an OpenStreetMap map (no key needed) with the route's pins and the driving path. Same props as the
 * native map: tapping a pin selects it.
 */
export function RouteMap({
  marks,
  route,
  selected,
  onSelect,
}: {
  marks: MapMark[];
  route: RouteResult | null;
  selected?: string | null;
  onSelect?: (key: string) => void;
}) {
  // On the web a View's ref is its DOM element, which Leaflet draws into.
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(m);
    m.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const routed = marks.filter((k) => k.kind === "stop" && k.status !== "skipped");
    if (route) {
      route.legs.forEach((leg, i) =>
        L.polyline(leg.path as [number, number][], { color: routed[i + 1]?.status === "done" ? "#9A9BA1" : MARK_COLORS.current, weight: 5, opacity: 0.85 }).addTo(g),
      );
    } else if (routed.length > 1) {
      L.polyline(routed.map((k) => [k.lat, k.lng] as [number, number]), { color: MARK_COLORS.pending, weight: 3, dashArray: "6 6" }).addTo(g);
    }
    // Places first so the route's own pins sit on top.
    for (const k of [...marks].sort((a, b) => (a.kind === "place" ? 0 : 1) - (b.kind === "place" ? 0 : 1) || (a.key === selected ? 1 : 0) - (b.key === selected ? 1 : 0))) {
      const title = k.n ? `${k.n}. ${k.title}` : k.kind === "hotel" ? `🏨 ${k.title}` : k.title;
      L.marker([k.lat, k.lng], { icon: icon(k, k.key === selected), title, alt: title, keyboard: true, zIndexOffset: k.key === selected ? 1000 : k.kind === "place" ? 0 : 500 })
        .on("click", () => select.current?.(k.key))
        .addTo(g);
    }
    // Frame everything once; after that the map stays where you moved it.
    const box = markRegion(marks);
    if (box && !fitted.current) {
      fitted.current = true;
      if (box.south === box.north && box.west === box.east) m.setView([box.south, box.west], 15);
      else m.fitBounds([[box.south, box.west], [box.north, box.east]], { padding: [36, 36], maxZoom: 16 });
    }
  }, [marks, route, selected]);

  // The map measures its box when created; tell it again once the screen has laid out.
  useEffect(() => {
    const h = setTimeout(() => map.current?.invalidateSize(), 50);
    return () => clearTimeout(h);
  }, []);

  return <View ref={host as never} testID="route-map" style={{ height: 420, borderRadius: 16, overflow: "hidden" }} />;
}
