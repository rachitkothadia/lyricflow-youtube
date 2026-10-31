import {
  artistCredits,
  evidence,
  titleSimilarity,
  identityKey,
  hypotheses,
  searchQueries,
  cleanTitle,
} from "../matching/identity";
import {
  Candidate,
  Lyrics,
  LyricLine,
  ProviderError,
  Song,
  normalize,
} from "../model";
import { abortable, RequestScheduler } from "./requests";

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}
export type Resolution =
  | { kind: "ready"; lyrics: Lyrics }
  | { kind: "ambiguous"; candidates: Candidate[] }
  | { kind: "not-found"; message: string };
export function parseLrc(input: string): LyricLine[] {
  if (input.length > 150000)
    throw new ProviderError("invalid-response", "Timing data is too large.");
  const offset = Number(input.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  const entries: { text: string; time: number }[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const stamps = [
      ...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g),
    ];
    const text = raw
      .replace(/\[[^\]]*\]/g, "")
      .replace(/<\d{1,3}:\d{2}(?:\.\d+)?>/g, "")
      .trim();
    if (/<\/?[a-z][^>]*>/i.test(text))
      throw new ProviderError(
        "invalid-response",
        "Lyrics response contains unexpected markup.",
      );
    for (const stamp of stamps) {
      if (Number(stamp[2]) >= 60) continue;
      const time =
        Number(stamp[1]) * 60 +
        Number(stamp[2]) +
        Number("0." + (stamp[3] || "0")) -
        offset;
      if (time >= 0 && Number.isFinite(time)) entries.push({ text, time });
    }
  }
  entries.sort((a, b) => a.time - b.time);
  const lines: LyricLine[] = [];
  for (const entry of entries) {
    const prev = lines.at(-1);
    if (!entry.text) {
      if (prev && entry.time > prev.time!) prev.endTime = entry.time;
      continue;
    }
    if (prev?.time === entry.time) {
      if (prev.text !== entry.text) prev.text += " / " + entry.text;
      continue;
    }
    lines.push(entry);
  }
  if (lines.length > 1000)
    throw new ProviderError("invalid-response", "Too many lyric lines.");
  return lines;
}
export function validateRecord(value: unknown): LrclibRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(v.id) ||
    Number(v.id) < 1 ||
    typeof v.trackName !== "string" ||
    !v.trackName.trim() ||
    typeof v.artistName !== "string" ||
    !v.artistName.trim()
  )
    return null;
  for (const field of ["plainLyrics", "syncedLyrics"])
    if (
      v[field] != null &&
      (typeof v[field] !== "string" || (v[field] as string).length > 150000)
    )
      return null;
  return {
    id: Number(v.id),
    trackName: v.trackName.slice(0, 300),
    artistName: v.artistName.slice(0, 300),
    albumName: typeof v.albumName === "string" ? v.albumName.slice(0, 300) : "",
    duration:
      typeof v.duration === "number" &&
      Number.isFinite(v.duration) &&
      v.duration > 0
        ? v.duration
        : undefined,
    instrumental: v.instrumental === true,
    plainLyrics: typeof v.plainLyrics === "string" ? v.plainLyrics : null,
    syncedLyrics: typeof v.syncedLyrics === "string" ? v.syncedLyrics : null,
  };
}
export function isLatin(text: string): boolean {
  return ![...text.matchAll(/\p{L}/gu)].some(
    ([c]) => !/\p{Script=Latin}/u.test(c),
  );
}
export function recordingVersion(text: string): string {
  return [
    ...new Set(
      (
        text.match(
          /\b(live|remix|acoustic|sped\s+up|slowed|instrumental|cover)\b/gi,
        ) || []
      ).map((s) => s.toLowerCase().replace(/\s+/g, " ")),
    ),
  ]
    .sort()
    .join(" ");
}
function comparable(text: string) {
  return normalize(
    text.replace(
      /\b(romanized|romanization|romaji|lyrics?|official|video|audio|mv|hd|4k)\b/gi,
      "",
    ),
  );
}
function similarity(a: string, b: string) {
  a = comparable(a);
  b = comparable(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = new Set(a.split(" ")),
    y = new Set(b.split(" "));
  return [...x].filter((w) => y.has(w)).length / Math.max(x.size, y.size);
}
export function rankRecords(song: Song, records: LrclibRecord[]): Candidate[] {
  return records
    .map((r) => {
      const identity = recordIdentity(r);
      const version = recordingVersion(r.trackName + " " + r.albumName);
      const delta =
        song.duration && r.duration
          ? Math.abs(song.duration - r.duration)
          : undefined;
      const latin = isLatin(r.syncedLyrics || r.plainLyrics || "");
      const score =
        0.58 * evidence(song, identity).title +
        0.3 * evidence(song, identity).artist +
        0.08 * (delta === undefined ? 0.5 : Math.max(0, 1 - delta / 20)) +
        0.02 * Number(!!r.syncedLyrics) +
        0.02 * Number(latin) -
        (version !== song.version ? 0.4 : 0);
      return {
        id: r.id,
        title: identity.title,
        artist: identity.artist,
        ...(identity.artists ? { artists: identity.artists } : {}),
        version,
        duration: r.duration,
        romanized: latin,
        url: `https://lrclib.net/api/get/${r.id}`,
        provider: "lrclib" as const,
        score,
        album: r.albumName,
        timed: hasVerifiedTiming(r),
      };
    })
    .sort((a, b) => b.score! - a.score! || a.id - b.id);
}
export function recordIdentity(record: LrclibRecord): Song {
  const featured = record.trackName.match(
    /\s*[(\[]\s*(?:feat|ft|featuring)\.?\s+([^\])]+)[\])]/i,
  );
  const title = cleanTitle(
    record.trackName
      .replace(/\s*[(\[]\s*(?:feat|ft|featuring)\.?\s+[^\])]+[\])]/gi, "")
      .replace(/\s*[(\[](?:paused|playing)[\])]\s*$/i, ""),
  );
  return {
    title,
    artist: record.artistName,
    version: recordingVersion(record.trackName + " " + record.albumName),
    duration: record.duration,
    ...(featured
      ? { artists: [record.artistName, ...artistCredits(featured[1])] }
      : {}),
  };
}
export function chooseRecord(
  song: Song,
  records: LrclibRecord[],
): Candidate | null {
  const timed = records.filter(hasVerifiedTiming);
  const preferred = selectRecord(song, timed);
  if (preferred && evidence(song, preferred).duration) return preferred;
  const selected = selectRecord(song, records);
  if (selected?.timed && !evidence(song, selected).duration)
    return selectRecord(
      song,
      records.filter((r) => !hasVerifiedTiming(r)),
    );
  return selected;
}
function hasVerifiedTiming(record: LrclibRecord): boolean {
  if (!record.syncedLyrics || record.instrumental) return false;
  try {
    return parseLrc(record.syncedLyrics).length > 0;
  } catch {
    return false;
  }
}
function selectRecord(song: Song, records: LrclibRecord[]): Candidate | null {
  const ranked = rankRecords(song, records),
    best = ranked[0];
  if (
    !best ||
    best.score! < 0.88 ||
    evidence(song, best).title < 0.9 ||
    evidence(song, best).artist < 1 ||
    !evidence(song, best).version
  )
    return null;
  // Editions of the same song can share a title. A materially different recording stays manual.
  if (
    song.duration &&
    best.duration &&
    Math.abs(song.duration - best.duration) > Math.max(15, song.duration * 0.08)
  )
    return null;
  const rival = ranked.find(
    (c) =>
      comparable(c.artist) !== comparable(best.artist) ||
      comparable(c.title) !== comparable(best.title) ||
      c.version !== best.version,
  );
  if (rival && best.score! - rival.score! < 0.12) return null;
  return best;
}
export function recordLyrics(record: LrclibRecord): Lyrics {
  if (record.instrumental)
    throw new ProviderError("instrumental", "This recording is instrumental.");
  const timed = record.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
  const lines = timed.length
    ? timed
    : (record.plainLyrics || "")
        .split(/\r?\n/)
        .map((text) => ({ text: text.trim() }))
        .filter((l) => l.text && !/^\[.*\]$/.test(l.text));
  if (!lines.length)
    throw new ProviderError("not-found", "This recording has no lyrics yet.");
  if (
    lines.length > 1000 ||
    lines.some((l) => l.text.length > 2000 || /<\/?[a-z][^>]*>/i.test(l.text))
  )
    throw new ProviderError("invalid-response", "Invalid lyrics response.");
  return {
    song: recordIdentity(record),
    lines,
    sourceUrl: `https://lrclib.net/api/get/${record.id}`,
    sourceLabel: "LRCLIB",
    provenance: "lrclib",
    romanized: isLatin(lines.map((l) => l.text).join("\n")),
  };
}
const scheduler = new RequestScheduler();
let blockedUntil = 0;
const recordsCache = new Map<
  number,
  { record: LrclibRecord; expires: number }
>();
export class LrclibProvider {
  private searches = new Map<string, { value: unknown; expires: number }>();
  constructor(private transport: typeof fetch = fetch.bind(globalThis)) {}
  private request(path: string, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const cached = this.searches.get(path);
    if (cached && cached.expires > Date.now())
      return Promise.resolve(cached.value);
    return scheduler.run(async () => {
      signal.throwIfAborted();
      if (Date.now() < blockedUntil)
        throw new ProviderError(
          "rate-limit",
          "Lyrics service asked us to wait. Try again later.",
        );
      const timeout = AbortSignal.timeout(12000);
      const combined = AbortSignal.any([signal, timeout]);
      let attempt = 0;
      let r: Response;
      while (true) {
        r = await abortable(
          this.transport("https://lrclib.net" + path, {
            headers: {
              "Lrclib-Client":
                "LyricFlow/0.2 (local Chrome extension; https://lrclib.net)",
            },
            signal: combined,
            credentials: "omit",
            redirect: "error",
          }),
          combined,
        );
        if (r.status !== 503 || attempt++ >= 2) break;
        const wait = Number(r.headers.get("Retry-After") || "2");
        if (!Number.isFinite(wait) || wait > 5) break;
        await abortable(
          new Promise((resolve) =>
            setTimeout(resolve, Math.max(1, wait) * 1000),
          ),
          combined,
        );
        combined.throwIfAborted();
      }
      if (r.status === 429 || r.status === 503) {
        const retry = r.headers.get("Retry-After");
        const seconds =
          retry && /^\d+$/.test(retry)
            ? Number(retry)
            : Math.max(
                1,
                ((retry ? Date.parse(retry) : 0) - Date.now()) / 1000,
              ) || 60;
        if (r.status === 429 || retry)
          blockedUntil =
            Date.now() + Math.max(1, Math.min(seconds, 3600)) * 1000;
        throw new ProviderError(
          "rate-limit",
          "Lyrics service is busy. Please retry later.",
        );
      }
      if (r.status === 404) return null;
      if (!r.ok)
        throw new ProviderError(
          "network",
          `Lyrics service returned ${r.status}.`,
        );
      const body = await abortable(r.text(), combined);
      if (body.length > 3000000)
        throw new ProviderError(
          "invalid-response",
          "Lyrics response is too large.",
        );
      const value = JSON.parse(body);
      if (
        Array.isArray(value) &&
        value.some((item) => !!validateRecord(item))
      ) {
        this.searches.set(path, { value, expires: Date.now() + 5 * 60 * 1000 });
        while (this.searches.size > 40)
          this.searches.delete(this.searches.keys().next().value!);
      }
      return value;
    }, signal);
  }
  private cache(records: LrclibRecord[]) {
    for (const r of records) {
      recordsCache.set(r.id, {
        record: r,
        expires: Date.now() + 5 * 60 * 1000,
      });
    }
    while (recordsCache.size > 60)
      recordsCache.delete(recordsCache.keys().next().value!);
  }
  async search(
    song: Song,
    signal: AbortSignal,
    fast = false,
  ): Promise<LrclibRecord[]> {
    const params = new URLSearchParams({ track_name: song.title });
    const names = song.artists?.length
      ? song.artists
      : artistCredits(song.artist);
    if (song.artist) params.set("artist_name", names[0] || song.artist);
    let value = await this.request("/api/search?" + params, signal);
    if (!Array.isArray(value))
      throw new ProviderError(
        "invalid-response",
        "Unexpected lyrics search response.",
      );
    let records = value
      .map(validateRecord)
      .filter((r): r is LrclibRecord => !!r);
    if (
      !selectRecord(song, records.filter(hasVerifiedTiming)) &&
      !(fast && selectRecord(song, records))
    ) {
      try {
        value = await this.request(
          "/api/search?" +
            new URLSearchParams({
              q: searchQueries(song)[0],
            }),
          signal,
        );
        if (Array.isArray(value))
          records = [
            ...new Map(
              [
                ...records,
                ...value
                  .map(validateRecord)
                  .filter((r): r is LrclibRecord => !!r),
              ].map((r) => [r.id, r]),
            ).values(),
          ];
      } catch (error) {
        signal.throwIfAborted();
        if (!records.length) throw error;
      }
    }
    this.cache(records);
    return records;
  }
  async getById(id: number, signal: AbortSignal): Promise<Lyrics> {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ProviderError("invalid-input", "Invalid song identifier.");
    const cached = recordsCache.get(id);
    let record =
      cached && cached.expires > Date.now()
        ? cached.record
        : validateRecord(await this.request("/api/get/" + id, signal));
    signal.throwIfAborted();
    if (!record)
      throw new ProviderError(
        "not-found",
        "That lyrics record is no longer available.",
      );
    this.cache([record]);
    return recordLyrics(record);
  }
  async resolve(
    song: Song,
    signal: AbortSignal,
    fast = false,
  ): Promise<Resolution> {
    const found = new Map<number, LrclibRecord>();
    for (const hint of hypotheses(song)) {
      for (const record of await this.search(hint, signal, fast))
        found.set(record.id, record);
      const chosen = chooseRecord(song, [...found.values()]);
      if (chosen) {
        const lyrics = await this.getById(chosen.id, signal);
        if (!lyrics.lines.every((l) => l.time !== undefined)) {
          const reference = { ...song, duration: undefined };
          lyrics.timingCandidates = rankRecords(
            reference,
            [...found.values()].filter(hasVerifiedTiming),
          )
            .filter((c) => {
              const m = evidence(reference, c);
              return (
                c.score! >= 0.88 &&
                m.title >= 0.9 &&
                m.artist === 1 &&
                m.version
              );
            })
            .slice(0, 3);
        }
        return { kind: "ready", lyrics };
      }
    }
    const records = [...found.values()];
    if (records.length) {
      const ranked = rankRecords(song, records);
      const seen = new Set<string>();
      const candidates = ranked
        .filter((c) => {
          const key = [
            comparable(c.title),
            comparable(c.artist),
            c.version,
            c.romanized,
            Math.round((c.duration || 0) / 4),
          ].join("|");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 6);
      return { kind: "ambiguous", candidates };
    }
    return {
      kind: "not-found",
      message:
        "No matching lyrics found. Correct the artist and title, or identify the playing audio.",
    };
  }
}
