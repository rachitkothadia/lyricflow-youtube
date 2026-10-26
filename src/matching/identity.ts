import { Song, normalize } from "../model";
export function artistCredits(value: string): string[] {
  const parts = value
    .replace(
      /[(\[][^)\]]*(?:official|lyrics|music video|prod(?:uced)?\.?\s+by)[^)\]]*[)\]]/gi,
      " ",
    )
    .replace(/[()[\]]/g, " ")
    .replace(/\b(?:ft|feat|featuring)\.?\s+/gi, " & ")
    .split(/\s+(?:x|and|with|vs\.?)\s+|\s*[&+,]\s*/i)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Map(parts.map((s) => [canonicalName(s), s])).values()].slice(
    0,
    12,
  );
}
export function canonicalName(value: string): string {
  return normalize(
    value
      .replace(/\$/g, "s")
      .replace(/@/g, "a")
      .replace(/(?<=\p{L})!(?=\p{L})/gu, "i"),
  ).replace(/\s/g, "");
}
function nameKeys(value: string) {
  return [normalize(value).replace(/\s/g, ""), canonicalName(value)].filter(
    Boolean,
  );
}
export function sameArtist(a: string, b: string) {
  return nameKeys(a).some((key) => nameKeys(b).includes(key));
}
export function cleanTitle(value: string): string {
  const cleaned = value
    .replace(/\s*[([](?:romanized|romanization|romaji)[)\]]\s*/gi, " ")
    .replace(
      /\s*[(\[](?:(?:official\s+)?(?:(?:music|lyric|lyrics)\s+)?(?:video|audio|mv|visuali[sz]er)|lyrics?|hd|4k)[)\]]\s*/gi,
      " ",
    )
    .trim();
  return cleaned || value.trim();
}
export function titleSimilarity(a: string, b: string): number {
  const aliases = (s: string) => {
    s = cleanTitle(s);
    const values = [s];
    if (/[^\x00-\x7f]/.test(s))
      for (const m of s.matchAll(/[([]([A-Za-z][A-Za-z\s'’-]+)[)\]]/g))
        values.push(m[1]);
    return values;
  };
  let score = 0;
  for (const left of aliases(a))
    for (const right of aliases(b)) {
      if (nameKeys(left).some((key) => nameKeys(right).includes(key))) return 1;
      const x = new Set(normalize(left).split(" ").filter(Boolean)),
        y = new Set(normalize(right).split(" ").filter(Boolean));
      score = Math.max(
        score,
        [...x].filter((w) => y.has(w)).length / Math.max(x.size, y.size, 1),
      );
    }
  return score;
}
export function artistSimilarity(request: Song, offered: Song): number {
  const requested = request.artists?.length
    ? request.artists
    : artistCredits(request.artist);
  if (!requested.length) return 0;
  const displayNames = artistCredits(request.artist);
  if (
    (normalize(request.artist) === normalize(offered.artist) ||
      (requested.length === 1 &&
        artistCredits(offered.artist).length === 1 &&
        (offered.artists?.length || 1) === 1 &&
        sameArtist(request.artist, offered.artist))) &&
    requested.every((n) => displayNames.some((d) => sameArtist(n, d)))
  )
    return 1;
  let known = offered.artists?.length ? offered.artists : [offered.artist];
  // Only infer serialized multiple credits when all names were requested, or a feature marker is explicit.
  if (
    !offered.artists?.length &&
    (requested.length > 1 ||
      /\b(?:ft|feat|featuring)\.?\s/i.test(offered.artist))
  )
    known = artistCredits(offered.artist);
  return (
    requested.filter((n) => known.some((k) => sameArtist(n, k))).length /
    requested.length
  );
}
export function hypotheses(song: Song): Song[] {
  return [
    song,
    ...(song.alternatives || [])
      .slice(0, 2)
      .map((h) => ({ ...h, version: song.version, duration: song.duration })),
  ];
}
export function evidence(song: Song, candidate: Song) {
  return hypotheses(song)
    .map((h) => ({
      title: titleSimilarity(h.title, candidate.title),
      artist: artistSimilarity(h, candidate),
      version: normalize(h.version) === normalize(candidate.version),
      duration:
        !h.duration ||
        !candidate.duration ||
        Math.abs(h.duration - candidate.duration) <= 8,
    }))
    .sort(
      (a, b) =>
        b.title * 0.55 + b.artist * 0.35 - (a.title * 0.55 + a.artist * 0.35),
    )[0];
}
export function identityKey(song: Song) {
  return [
    canonicalName(cleanTitle(song.title)),
    (song.artists || artistCredits(song.artist))
      .map(canonicalName)
      .sort()
      .join("|"),
    normalize(song.version),
  ].join("::");
}
export function searchQueries(song: Song): string[] {
  const queries: string[] = [];
  for (const h of hypotheses(song)) {
    const names = h.artists?.length ? h.artists : artistCredits(h.artist);
    queries.push(
      [names[0] || h.artist, cleanTitle(h.title)].filter(Boolean).join(" "),
    );
  }
  for (const h of hypotheses(song))
    queries.push(
      [...(h.artists || artistCredits(h.artist)), cleanTitle(h.title)].join(
        " ",
      ),
    );
  for (const query of [...queries]) {
    const alias = query
      .replace(/\$/g, "s")
      .replace(/@/g, "a")
      .replace(/(?<=\p{L})!(?=\p{L})/gu, "i");
    if (normalize(alias) !== normalize(query)) queries.push(alias);
  }
  queries.push(cleanTitle(song.title));
  return [
    ...new Map(
      queries.map((q) => [normalize(q), q.trim().slice(0, 280)]),
    ).values(),
  ]
    .filter(Boolean)
    .slice(0, 3);
}
export function validSong(value: unknown): value is Song {
  if (!value || typeof value !== "object") return false;
  const s = value as Song;
  const text = (x: unknown, n = 300) => typeof x === "string" && x.length <= n;
  const names = (x: unknown) =>
    x === undefined ||
    (Array.isArray(x) && x.length <= 12 && x.every((n) => text(n, 200)));
  return (
    text(s.title) &&
    !!s.title.trim() &&
    text(s.artist) &&
    text(s.version) &&
    names(s.artists) &&
    (s.duration === undefined ||
      (typeof s.duration === "number" &&
        Number.isFinite(s.duration) &&
        s.duration >= 0)) &&
    (s.rawTitle === undefined || text(s.rawTitle, 1000)) &&
    (s.channel === undefined || text(s.channel)) &&
    (s.alternatives === undefined ||
      (Array.isArray(s.alternatives) &&
        s.alternatives.length <= 2 &&
        s.alternatives.every(
          (h) => h && text(h.title) && text(h.artist) && names(h.artists),
        )))
  );
}
