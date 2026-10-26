export interface Song {
  title: string;
  artist: string;
  version: string;
  duration?: number;
  artists?: string[];
  rawTitle?: string;
  channel?: string;
  alternatives?: Array<{ title: string; artist: string; artists?: string[] }>;
}
export interface Candidate extends Song {
  id: number;
  url: string;
  romanized: boolean;
  score?: number;
  provider?: "lrclib" | "genius";
  album?: string;
  timed?: boolean;
}
export interface LyricLine {
  text: string;
  section?: string;
  time?: number;
  endTime?: number;
  originalText?: string;
}
export interface Lyrics {
  song: Song;
  lines: LyricLine[];
  sourceUrl: string;
  provenance: "synthetic" | "user-confirmed" | "lrclib" | "genius";
  romanized: boolean;
  sourceLabel?: string;
  romanization?: "existing" | "generated";
  romanizationSystems?: string[];
  timingCandidates?: Candidate[];
  timingSource?: { url: string; label: string };
}
export interface LyricsProvider {
  get(song: Song, signal: AbortSignal): Promise<Lyrics>;
}
export interface TimingProvider {
  get(song: Song, signal: AbortSignal): Promise<LyricLine[]>;
}
export interface SongRecognizer {
  recognize(signal: AbortSignal): Promise<Song | null>;
}
export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function safeGeniusUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing Genius source link.");
  const u = new URL(value.trim());
  if (u.hostname === "www.genius.com") u.hostname = "genius.com";
  if (
    u.protocol !== "https:" ||
    u.hostname !== "genius.com" ||
    u.username ||
    u.password ||
    u.port
  )
    throw new Error("Use an https://genius.com source link.");
  if (/^\/[a-z\d%'-]+-lyrics\/?$/i.test(u.pathname)) {
    u.pathname = u.pathname.replace(/\/$/, "");
    u.search = "";
    u.hash = "";
  }
  return u.href;
}
