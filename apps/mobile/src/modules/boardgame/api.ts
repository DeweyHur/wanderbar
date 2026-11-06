import { api } from "@/core/api";

export const LINK_KINDS = ["bgg", "bga", "tts", "rulebook", "video", "other"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export type GameLink = { kind: LinkKind; url: string; label: string | null };
export type Rating = { avg: number | null; count: number };
export type Person = { id: string; name: string };
/** What BoardGameGeek says about a game (picture from BGG's image server). */
export type BggInfo = {
  id: number;
  year: number | null;
  image: string | null;
  thumbnail: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  weight: number | null;
};
export type BggHit = { id: number; name: string; year: number | null };
export type BggGame = Omit<BggInfo, "id"> & { id: number; name: string };

export type GameSummary = {
  id: string;
  groupId: string;
  name: string;
  memo: string;
  createdBy: string;
  links: GameLink[];
  tags: string[];
  rating: Rating;
  myScore: number | null;
  plays: number;
  lastPlayedAt: string | null;
  queuedBy: { userId: string; name: string }[];
  queuedByMe: boolean;
  bgg: BggInfo | null;
};
export type Game = GameSummary & {
  canDelete: boolean;
  mine: { score: number; review: string } | null;
  ratings: { userId: string; name: string; score: number; review: string; updatedAt: string }[];
  nights: { id: string; startsAt: string; past: boolean }[];
};
export type GameInput = { name?: string; memo?: string; links?: { kind: LinkKind; url: string; label?: string | null }[]; tags?: string[] };

export type NightStatus = "upcoming" | "live" | "past";
export type NightGame = { id: string; name: string; links: GameLink[]; tags: string[]; rating: Rating; myScore: number | null; myReview: string | null; bgg: BggInfo | null };
export type NightSummary = {
  id: string;
  groupId: string;
  seriesId: string | null;
  seriesTitle: string | null;
  startsAt: string;
  location: string;
  note: string;
  picker: Person | null;
  status: NightStatus;
  games: NightGame[];
};
export type Night = NightSummary & {
  timezone: string;
  canManage: boolean;
  canEditLineup: boolean;
  canAssignPicker: boolean;
  members: Person[];
};
export type Series = { id: string; title: string; weekday: number; time: string; everyWeeks: number; startDate: string; location: string };
export type SeriesInput = Partial<Omit<Series, "id">>;
export type QueueEntry = { id: string; name: string; links: GameLink[]; tags: string[]; rating: Rating; plays: number; queuedBy: { userId: string; name: string }[]; queuedByMe: boolean; bgg: BggInfo | null };
export type Home = { timezone: string; canManage: boolean; series: Series[]; upcoming: NightSummary[]; past: NightSummary[]; queue: QueueEntry[] };
export type NightInput = { date?: string; time?: string; location?: string; note?: string; pickerId?: string | null };

let bggOn: Promise<boolean> | null = null;
/** Whether the server can look games up on BoardGameGeek (it needs a BGG token). */
export const bggAvailable = () => (bggOn ??= api<{ bgg?: boolean }>("/api/config").then((c) => !!c.bgg, () => false));

export const bggApi = {
  search: (q: string) => api<{ results: BggHit[] }>(`/api/bgg/search?q=${encodeURIComponent(q)}`).then((r) => r.results),
  game: (id: number) => api<BggGame>(`/api/bgg/games/${id}`),
};
export const bggLink = (id: number) => `https://boardgamegeek.com/boardgame/${id}`;

export const bgApi = {
  home: (groupId: string) => api<Home>(`/api/groups/${groupId}/boardgame`),
  games: (groupId: string) => api<{ games: GameSummary[] }>(`/api/groups/${groupId}/games`).then((r) => r.games),
  createGame: (groupId: string, g: GameInput) => api<Game>(`/api/groups/${groupId}/games`, { body: g }),
  game: (id: string) => api<Game>(`/api/games/${id}`),
  updateGame: (id: string, g: GameInput) => api<Game>(`/api/games/${id}`, { method: "PATCH", body: g }),
  deleteGame: (id: string) => api(`/api/games/${id}`, { method: "DELETE" }),
  rate: (id: string, score: number, review: string) => api<Game>(`/api/games/${id}/rating`, { method: "PUT", body: { score, review } }),
  unrate: (id: string) => api<Game>(`/api/games/${id}/rating`, { method: "DELETE" }),
  refreshBgg: (id: string) => api<Game>(`/api/games/${id}/bgg`, { body: {} }),
  queue: (id: string) => api<Game>(`/api/games/${id}/queue`, { body: {} }),
  unqueue: (id: string) => api<Game>(`/api/games/${id}/queue`, { method: "DELETE" }),
  createSeries: (groupId: string, s: SeriesInput) => api<Series>(`/api/groups/${groupId}/series`, { body: s }),
  updateSeries: (id: string, s: SeriesInput) => api<Series>(`/api/series/${id}`, { method: "PATCH", body: s }),
  deleteSeries: (id: string) => api(`/api/series/${id}`, { method: "DELETE" }),
  createNight: (groupId: string, n: NightInput) => api<Night>(`/api/groups/${groupId}/nights`, { body: n }),
  night: (id: string) => api<Night>(`/api/nights/${id}`),
  updateNight: (id: string, n: NightInput) => api<Night>(`/api/nights/${id}`, { method: "PATCH", body: n }),
  deleteNight: (id: string) => api(`/api/nights/${id}`, { method: "DELETE" }),
  addGame: (nightId: string, gameId: string) => api<Night>(`/api/nights/${nightId}/games`, { body: { gameId } }),
  removeGame: (nightId: string, gameId: string) => api<Night>(`/api/nights/${nightId}/games/${gameId}`, { method: "DELETE" }),
};
