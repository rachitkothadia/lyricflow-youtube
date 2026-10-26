import { Candidate, Song, normalize, safeGeniusUrl } from "../model";
import {
  artistCredits,
  sameArtist,
  evidence,
  identityKey,
} from "../matching/identity";
export function rankCandidates(
  song: Song,
  candidates: Candidate[],
): Candidate[] {
  return candidates
    .map((c) => {
      const match = evidence(song, c);
      return {
        ...c,
        score: Math.max(
          0,
          0.55 * match.title +
            0.35 * match.artist +
            0.1 * Number(c.romanized) -
            (match.version ? 0 : 0.5) -
            (match.duration ? 0 : 0.3),
        ),
      };
    })
    .sort((a, b) => b.score! - a.score!);
}
export function chooseCandidate(
  song: Song,
  candidates: Candidate[],
): Candidate | null {
  const ranked = rankCandidates(song, candidates),
    best = ranked[0];
  if (!best) return null;
  const match = evidence(song, best);
  if (
    best.score! < 0.87 ||
    match.title < 0.9 ||
    match.artist < 1 ||
    !match.version ||
    !match.duration
  )
    return null;
  const rival = ranked
    .slice(1)
    .find(
      (c) =>
        !(
          best.romanized !== c.romanized && identityKey(best) === identityKey(c)
        ),
    );
  return !rival || best.score! - rival.score! >= 0.12 ? best : null;
}
export function parseGeniusResults(value: unknown): Candidate[] {
  const hits = (value as { response?: { hits?: unknown[] } })?.response?.hits;
  if (!Array.isArray(hits))
    throw new Error("Genius returned an unexpected response.");
  return hits.slice(0, 20).flatMap((h) => {
    const r = (h as { result?: Record<string, unknown> })?.result;
    if (
      !r ||
      typeof r.title !== "string" ||
      typeof r.id !== "number" ||
      !Number.isFinite(r.id)
    )
      return [];
    const primary = (r.primary_artist as { name?: unknown })?.name;
    const readNames = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap((a) =>
            a && typeof a === "object" && typeof a.name === "string"
              ? [a.name]
              : [],
          )
        : [];
    const primaryNames = readNames(r.primary_artists);
    const artist = typeof primary === "string" ? primary : primaryNames[0];
    if (typeof artist !== "string") return [];
    let title = r.title;
    let recordingArtist =
      typeof r.artist_names === "string" ? r.artist_names : artist;
    let names = [artist, ...primaryNames, ...readNames(r.featured_artists)];
    if (recordingArtist !== artist)
      names.push(...artistCredits(recordingArtist));
    if (normalize(artist) === "genius romanizations") {
      const recording = title.match(
        /^(.+?)\s+[-–—]\s+(.+?)\s*[([]romanized[)\]]\s*$/i,
      );
      if (recording) {
        recordingArtist = recording[1].trim();
        title = recording[2].trim();
        names = artistCredits(recordingArtist);
      }
    }
    names = names
      .filter(
        (name, index, array) =>
          name.trim() && array.findIndex((n) => sameArtist(n, name)) === index,
      )
      .slice(0, 12);
    try {
      return [
        {
          id: r.id,
          title,
          artist: recordingArtist,
          ...(names.length > 1 ? { artists: names } : {}),
          version: (
            r.title.match(
              /\b(live|remix|acoustic|sped up|slowed|instrumental|cover)\b/gi,
            ) || []
          )
            .map((s) => s.toLowerCase())
            .sort()
            .join(" "),
          url: safeGeniusUrl(r.url),
          romanized: /romaniz(ed|ation)/i.test(r.title + " " + artist),
        },
      ];
    } catch {
      return [];
    }
  });
}
