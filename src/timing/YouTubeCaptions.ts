import { LyricLine, normalize } from "../model";
export function parseCaptionJson(input: unknown): LyricLine[] {
  const events = (input as { events?: any[] })?.events;
  if (!Array.isArray(events) || events.length > 10000)
    throw new Error("No usable video captions were returned.");
  const lines: LyricLine[] = [];
  for (const event of events) {
    if (
      !Number.isFinite(event.tStartMs) ||
      event.tStartMs < 0 ||
      !Array.isArray(event.segs)
    )
      continue;
    for (const segment of event.segs) {
      if (typeof segment.utf8 !== "string") continue;
      if (
        segment.tOffsetMs !== undefined &&
        (!Number.isFinite(segment.tOffsetMs) || segment.tOffsetMs < 0)
      )
        throw new Error("Invalid video caption timing.");
      const text = segment.utf8.replace(/[♪♫]/g, "").trim();
      if (!text || /^\[(?:music|applause|instrumental|संगीत)\]$/i.test(text))
        continue;
      const time =
        (event.tStartMs +
          (Number.isFinite(segment.tOffsetMs) ? segment.tOffsetMs : 0)) /
        1000;
      if (time < 0 || time > 86400 || text.length > 2000)
        throw new Error("Invalid video caption timing.");
      const endTime =
        Number.isFinite(event.dDurationMs) && event.dDurationMs > 0
          ? (event.tStartMs + event.dDurationMs) / 1000
          : undefined;
      if (lines.at(-1)?.time === time) {
        lines.at(-1)!.text += " " + text;
        continue;
      }
      lines.push({
        text,
        time,
        ...(endTime && endTime > time ? { endTime } : {}),
      });
    }
  }
  if (
    !lines.length ||
    lines.length > 1000 ||
    lines.some((l, i) => i > 0 && l.time! <= lines[i - 1].time!)
  )
    throw new Error(
      "Video captions do not contain usable increasing timestamps.",
    );
  return lines.map((line, i) => ({
    ...line,
    ...(line.endTime !== undefined && lines[i + 1]
      ? { endTime: Math.min(line.endTime, lines[i + 1].time!) }
      : {}),
  }));
}
export function captionsMatch(
  lyrics: LyricLine[],
  captions: LyricLine[],
): boolean {
  const a = normalize(lyrics.map((l) => l.text).join(" ")),
    b = normalize(captions.map((l) => l.text).join(" "));
  return !!a && a === b;
}
/** Transfer only actual caption boundaries; never interpolate a missing line start. */
export function alignCaptionTiming(
  lyrics: LyricLine[],
  captions: LyricLine[],
): LyricLine[] {
  if (!captionsMatch(lyrics, captions))
    throw new Error(
      "Video captions do not match the lyric text. Existing timing was kept.",
    );
  let words = 0;
  const boundaries = new Map<number, LyricLine>();
  for (const caption of captions) {
    boundaries.set(words, caption);
    words += normalize(caption.text).split(" ").filter(Boolean).length;
  }
  words = 0;
  const lines = lyrics.map((line) => {
    const caption = boundaries.get(words);
    if (caption?.time === undefined)
      throw new Error(
        "Captions have no timestamp at every lyric line. Existing timing was kept.",
      );
    words += normalize(line.text).split(" ").filter(Boolean).length;
    return { ...line, time: caption.time, endTime: undefined };
  });
  if (lines.some((line, i) => i > 0 && line.time <= lines[i - 1].time))
    throw new Error(
      "Caption line timestamps are not increasing. Existing timing was kept.",
    );
  return lines;
}
export async function videoCaptions(
  videoId: string,
  signal: AbortSignal,
): Promise<{ lines: LyricLine[]; label: string; url: string }> {
  const find = () =>
    performance
      .getEntriesByType("resource")
      .map((e) => {
        try {
          return new URL(e.name);
        } catch {
          return null;
        }
      })
      .filter(
        (u): u is URL =>
          !!u &&
          u.origin === location.origin &&
          u.pathname === "/api/timedtext" &&
          u.searchParams.get("v") === videoId,
      )
      .at(-1);
  const button = document.querySelector<HTMLButtonElement>(
    ".ytp-subtitles-button",
  );
  let url = find(),
    enabled = false;
  try {
    if (!url) {
      if (!button || button.getAttribute("aria-disabled") === "true")
        throw new Error("This video has no accessible caption timing.");
      if (button.getAttribute("aria-pressed") !== "true") {
        button.click();
        enabled = true;
      }
      const deadline = Date.now() + 10000;
      while (!url && Date.now() < deadline) {
        signal.throwIfAborted();
        await new Promise((r) => setTimeout(r, 150));
        url = find();
      }
    }
    signal.throwIfAborted();
    if (!url)
      throw new Error(
        "No caption data became available. Play the song with captions on, then try again.",
      );
    url.searchParams.set("fmt", "json3");
    const response = await fetch(url, {
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    if (!response.ok)
      throw new Error("YouTube did not provide readable caption timing.");
    const text = await response.text();
    if (!text || text.length > 2500000)
      throw new Error("No usable caption timing was returned.");
    return {
      lines: parseCaptionJson(JSON.parse(text)),
      label:
        url.searchParams.get("kind") === "asr"
          ? "YouTube automatic captions"
          : "YouTube captions",
      url: "https://www.youtube.com/watch?v=" + videoId,
    };
  } finally {
    if (enabled && button?.getAttribute("aria-pressed") === "true")
      button.click();
  }
}
