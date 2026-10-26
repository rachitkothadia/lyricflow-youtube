import { Lyrics, LyricLine, safeGeniusUrl } from "../model";
export function parseLines(text: string): LyricLine[] {
  if (/<\/?[a-z][^>]*>/i.test(text))
    throw new Error("Use plain text, not HTML.");
  let section: string | undefined;
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((text) => {
      if (/^\[.*\]$/.test(text)) {
        section = text.slice(1, -1);
        return [];
      }
      return [{ text, section }];
    });
}
export function parseImport(raw: string): Lyrics {
  if (raw.length > 150000) throw new Error("File exceeds 150 KB.");
  const v = JSON.parse(raw);
  if (v?.romanized !== true || v?.provenance !== "user-confirmed")
    throw new Error(
      "Confirm Romanized text and your right to use it in the import file.",
    );
  if (
    !v.song ||
    typeof v.song.title !== "string" ||
    typeof v.song.artist !== "string" ||
    typeof v.song.version !== "string" ||
    !v.song.title.trim() ||
    !v.song.artist.trim()
  )
    throw new Error("Missing song title, artist or recording version.");
  if (!Array.isArray(v.lines) || !v.lines.length || v.lines.length > 1000)
    throw new Error("Provide 1–1000 structured lyric lines.");
  let last = -1;
  const lines = v.lines.map((l: LyricLine) => {
    if (
      !l ||
      typeof l.text !== "string" ||
      !l.text.trim() ||
      l.text.length > 1000 ||
      /<\/?[a-z][^>]*>/i.test(l.text) ||
      (l.section !== undefined && typeof l.section !== "string")
    )
      throw new Error("Invalid lyric line; HTML is not accepted.");
    if (
      (l.text.match(/\p{L}/gu) || []).some(
        (letter) => !/\p{Script=Latin}/u.test(letter),
      )
    )
      throw new Error("Import must contain Romanized Latin-script lyric text.");
    if (l.time !== undefined) {
      if (
        typeof l.time !== "number" ||
        !Number.isFinite(l.time) ||
        l.time < 0 ||
        l.time <= last
      )
        throw new Error(
          "Timestamps must be finite, positive and strictly increasing.",
        );
      last = l.time;
    }
    return { text: l.text.trim(), section: l.section, time: l.time };
  });
  if (
    lines.some((l: LyricLine) => l.time !== undefined) &&
    lines.some((l: LyricLine) => l.time === undefined)
  )
    throw new Error("Supply timestamps for every line or none.");
  return {
    song: {
      title: v.song.title.slice(0, 300),
      artist: v.song.artist.slice(0, 300),
      version: v.song.version.slice(0, 100),
    },
    lines,
    sourceUrl: safeGeniusUrl(v.sourceUrl),
    romanized: true,
    provenance: "user-confirmed",
  };
}
