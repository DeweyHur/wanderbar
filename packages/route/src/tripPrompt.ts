import { formatPlaceDistance, metersBetween } from "./placeSearch";

/**
 * A ready-to-paste prompt asking an AI (Claude, ChatGPT…) to plan a trip day by day around the places the
 * group has bookmarked: the trip's dates, how you get around, the hotels by night, what each day already
 * has, and the bookmarks grouped by the hotel they're nearest to.
 */
export type PromptPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** saved = a saved restaurant; been = done on a route before; planned = on a route, not done yet. */
  kind: "saved" | "been" | "planned";
  hoursRaw?: string;
};
export type PromptHotel = { name: string; address: string; checkIn: string; checkOut: string; lat: number | null; lng: number | null };
export type PromptDay = { date: string; stops: { name: string; address?: string; done?: boolean }[] };
export type PromptTrip = {
  title: string;
  startDate: string;
  endDate: string;
  transport: "car" | "flight" | "train" | "bus" | "other";
  rentalCar: boolean;
  hotels: PromptHotel[];
  days: PromptDay[];
  places: PromptPlace[];
};

const WEEK = { ko: ["일", "월", "화", "수", "목", "금", "토"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
const day = (iso: string, ko: boolean) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const w = WEEK[ko ? "ko" : "en"][d.getUTCDay()];
  return ko ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${w})` : `${w} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const shortHours = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 90);

/** The hotel you sleep at on the night of `date` (check-in ≤ date < check-out). */
const hotelFor = (hotels: PromptHotel[], date: string) => hotels.find((h) => h.checkIn <= date && date < h.checkOut) ?? null;
const prevDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

export function tripPlanPrompt(trip: PromptTrip, lang: "ko" | "en", opts: { miles?: boolean; perHotel?: number; nearMeters?: number } = {}): string {
  const ko = lang === "ko";
  const miles = opts.miles ?? !ko;
  const perHotel = opts.perHotel ?? 25;
  const near = opts.nearMeters ?? 80_000;
  const L: string[] = [];
  const n = nightsBetween(trip.startDate, trip.endDate);

  const transport = {
    car: ko ? "자차로 이동" : "driving our own car",
    flight: ko ? "비행기" : "flying in",
    train: ko ? "기차" : "by train",
    bus: ko ? "버스" : "by bus",
    other: ko ? "기타 교통" : "other transport",
  }[trip.transport];
  const getAround =
    trip.transport === "car" ? transport : `${transport}${trip.rentalCar ? (ko ? " + 현지 렌터카" : ", with a rental car there") : ko ? ", 현지에선 차 없음(대중교통·도보)" : ", no car there (transit / walking)"}`;

  L.push(ko ? "아래 여행의 날짜별 동선을 짜줘." : "Please plan this trip day by day.");
  L.push("");
  L.push(
    ko
      ? `여행: ${trip.title || "여행"} · ${day(trip.startDate, ko)} ~ ${day(trip.endDate, ko)} (${n}박 ${n + 1}일)`
      : `Trip: ${trip.title || "Trip"} · ${day(trip.startDate, ko)} – ${day(trip.endDate, ko)} (${n} night${n === 1 ? "" : "s"})`,
  );
  L.push(ko ? `이동: ${getAround}` : `Getting around: ${getAround}`);

  // Hotels by night.
  L.push("");
  L.push(ko ? "숙소" : "Hotels");
  if (!trip.hotels.length) L.push(ko ? "- (아직 없음)" : "- (none yet)");
  for (const h of [...trip.hotels].sort((a, b) => a.checkIn.localeCompare(b.checkIn))) {
    const k = nightsBetween(h.checkIn, h.checkOut);
    L.push(`- ${day(h.checkIn, ko)} ~ ${day(h.checkOut, ko)} · ${ko ? `${k}박` : `${k} night${k === 1 ? "" : "s"}`}: ${h.name}${h.address ? ` (${h.address})` : ""}`);
  }

  // Each day: where it starts and ends, and what's already on it.
  L.push("");
  L.push(ko ? "날짜별 상황" : "Each day");
  trip.days.forEach((d, i) => {
    const from = i === 0 ? null : hotelFor(trip.hotels, prevDay(d.date));
    const to = hotelFor(trip.hotels, d.date);
    const start = from ? `🏨 ${from.name}` : i === 0 ? (ko ? "도착/출발" : "arrival") : ko ? "(숙소 없음)" : "(no hotel)";
    const end = to ? `🏨 ${to.name}` : i === trip.days.length - 1 ? (ko ? "집으로" : "heading home") : ko ? "(숙소 미정)" : "(no hotel yet)";
    L.push(`- ${day(d.date, ko)}: ${start} → ${end}`);
    const fixed = d.stops.filter((s) => !s.done);
    if (fixed.length) L.push(`  ${ko ? "이미 넣은 곳" : "Already planned"}: ${fixed.map((s) => s.name).join(", ")}`);
  });

  // Bookmarks, under the hotel they're nearest to (nearest first); the rest under "elsewhere".
  const located = trip.hotels.filter((h) => h.lat != null && h.lng != null).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const groups = new Map<PromptHotel | null, (PromptPlace & { m: number | null })[]>();
  const fixedNames = new Set(trip.days.flatMap((d) => d.stops.map((s) => s.name.trim().toLowerCase())));
  for (const p of trip.places) {
    let best: { h: PromptHotel; m: number } | null = null;
    for (const h of located) {
      const m = metersBetween({ lat: h.lat!, lng: h.lng! }, p);
      if (!best || m < best.m) best = { h, m };
    }
    const key = best && best.m <= near ? best.h : null;
    if (!key && located.length && best && best.m > near * 3) continue; // nowhere near this trip
    const list = groups.get(key) ?? [];
    list.push({ ...p, m: key ? best!.m : null });
    groups.set(key, list);
  }
  const kindLabel = (k: PromptPlace["kind"]) =>
    ko ? { saved: "저장한 곳", been: "가 본 곳", planned: "가고 싶은 곳" }[k] : { saved: "saved place", been: "been before", planned: "want to go" }[k];
  const line = (p: PromptPlace & { m: number | null }) =>
    `- ${p.name}${p.address ? ` — ${p.address}` : ""} · ${[p.m != null ? formatPlaceDistance(p.m, miles) : null, kindLabel(p.kind), shortHours(p.hoursRaw) ? `${ko ? "영업" : "hours"} ${shortHours(p.hoursRaw)}` : null, fixedNames.has(p.name.trim().toLowerCase()) ? (ko ? "이미 일정에 있음" : "already on a day") : null].filter(Boolean).join(" · ")}`;

  L.push("");
  L.push(ko ? "우리가 북마크해 둔 곳 (숙소에서 가까운 순)" : "Places we've bookmarked (nearest to each hotel first)");
  if (!trip.places.length) L.push(ko ? "- (없음)" : "- (none)");
  for (const h of located) {
    const list = (groups.get(h) ?? []).sort((a, b) => (a.m ?? 0) - (b.m ?? 0));
    if (!list.length) continue;
    L.push(`[${ko ? `🏨 ${h.name} 근처` : `Near 🏨 ${h.name}`}]`);
    list.slice(0, perHotel).forEach((p) => L.push(line(p)));
  }
  const rest = groups.get(null) ?? [];
  if (rest.length) {
    L.push(`[${ko ? "그 밖 (가는 길 등)" : "Elsewhere (on the way, etc.)"}]`);
    rest.slice(0, perHotel).forEach((p) => L.push(line(p)));
  }

  L.push("");
  L.push(ko ? "부탁" : "What I'd like");
  const asks = ko
    ? [
        "날짜마다 아침부터 저녁까지 동선을 짜줘. 그날 아침 숙소에서 출발해서 그날 밤 숙소로 끝나게.",
        "북마크한 곳을 최대한 활용하고, 서로 가까운 곳끼리 같은 날에 묶어서 이동을 줄여줘.",
        "영업시간이 적힌 곳은 그 시간에 맞춰 넣고, 식사(점심·저녁) 시간에는 식당을 넣어줘.",
        "'이미 넣은 곳'은 그날 일정에 꼭 포함해줘.",
        "북마크에 없는 곳을 추천할 때는 (새로운 곳)이라고 표시해줘.",
        "날짜별로 '시간 · 장소 · 한 줄 이유/팁 · 다음 장소까지 이동 시간' 형식의 목록으로 써줘.",
      ]
    : [
        "Plan each day from morning to evening, starting at that morning's hotel and ending at that night's hotel.",
        "Use our bookmarks as much as possible, grouping places that are close to each other on the same day to cut travel.",
        "Respect opening hours where they're listed, and put restaurants at lunch and dinner time.",
        "Keep everything under \"Already planned\" on its day.",
        "If you suggest a place that isn't bookmarked, mark it (new).",
        "For each day, give a list of: time · place · one-line reason or tip · travel time to the next place.",
      ];
  asks.forEach((a, i) => L.push(`${i + 1}. ${a}`));
  return L.join("\n");
}
