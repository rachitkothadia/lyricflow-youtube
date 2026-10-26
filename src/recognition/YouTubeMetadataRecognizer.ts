import { artistCredits, sameArtist, cleanTitle } from "../matching/identity";
import { Song, normalize } from "../model";
export function parseMetadata(
  raw: string,
  channel: string,
  duration?: number,
): Song | null {
  raw = raw.trim();
  const recordingRaw = raw;
  const channelArtist = channel
    .replace(/\s*(- Topic|VEVO|Official)\s*$/i, "")
    .trim();
  const artistMatches = (value: string) =>
    !!channelArtist &&
    (sameArtist(channelArtist, value) ||
      artistCredits(value).some((name) => sameArtist(name, channelArtist)));
  const recordingParts = raw
    .split(/\s*[|｜]\s*/)[0]
    .split(/\s+[-–—]\s*|[-–—]\s+/);
  let credits =
    recordingParts.length > 1 ? artistCredits(recordingParts[0]) : [];
  if (
    recordingParts.length > 1 &&
    artistMatches(recordingParts[1]) &&
    !artistMatches(recordingParts[0])
  ) {
    credits = artistCredits(recordingParts[1]);
    raw = `${channelArtist} - ${recordingParts[0]}`;
  } else if (recordingParts.length > 2 && artistMatches(recordingParts[0])) {
    raw = `${channelArtist} - ${recordingParts[1]}`;
  }
  // Official music channels commonly quote the song instead of using a dash.
  const quoted = raw.match(/^(.+?)\s+['"‘“](.+?)['"’”](?:\s|$)/);
  if (quoted) {
    const artist = quoted[1].replace(/\([^)]*\)/g, "").trim();
    let song = quoted[2];
    const latinAlias = song.match(/\(([A-Za-z][A-Za-z\s]+)\)/);
    if (latinAlias && /[^\x00-\x7f]/.test(song)) song = latinAlias[1];
    raw = `${artist} - ${song} ${raw.slice(quoted[0].length)}`;
  }
  const title = cleanTitle(raw)
    .replace(/\s*[|｜]\s*.*$/, "")
    .replace(
      /\b(official\s+(music\s+)?(video|audio|mv)|music video|lyrics?|romanized)\b/gi,
      "",
    )
    .replace(/[()[\]【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;
  // Recording labels can follow publisher separators even when that suffix
  // should not be included in the searchable song title.
  const version = [
    ...new Set(
      (
        recordingRaw.match(
          /\b(live|remix|acoustic|sped\s+up|slowed|instrumental|cover)\b/gi,
        ) || []
      ).map((s) => s.toLowerCase().replace(/\s+/g, " ")),
    ),
  ]
    .sort()
    .join(" ");
  const parts = title.split(/\s+[-–—]\s*|[-–—]\s+/);
  const artist = parts.length > 1 ? parts.shift()!.trim() : channelArtist;
  if (!credits.length) credits = artistCredits(artist);
  const featured = recordingRaw
    .match(/\b(?:ft|feat|featuring)\.?\s+([^([|\]]+)/i)?.[1]
    ?.split(/\s+[-–—]\s*|[-–—]\s+/)[0];
  if (featured) credits.push(...artistCredits(featured));
  credits = credits.filter(
    (name, index, array) =>
      array.findIndex((other) => sameArtist(name, other)) === index,
  );
  return {
    artist,
    title: parts
      .join(" - ")
      .replace(/\s+(?:ft\.?|feat\.?|featuring|prod\.?\s+by)\s+.*$/i, "")
      .trim(),
    version,
    duration: Number.isFinite(duration) ? duration : undefined,
    ...(credits.length > 1 ? { artists: credits } : {}),
  };
}
/** Read native text without SponsorBlock/category pills, icons or other injected controls. */
function nativeText(element: Element | null): string {
  if (!element) return "";
  const copy = element.cloneNode(true) as Element;
  copy
    .querySelectorAll(
      [
        "button",
        "[role=button]",
        "svg",
        "img",
        "style",
        "script",
        "yt-icon",
        "yt-button-shape",
        "[hidden]",
        '[aria-hidden="true"]',
        '[class*="sponsor" i]',
        '[id*="sponsor" i]',
        '[class*="categorypill" i]',
        '[id*="categorypill" i]',
        '[class*="badge" i]',
      ].join(","),
    )
    .forEach((node) => node.remove());
  return (copy.textContent || "")
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function videoId(value: string): string | null {
  try {
    const url = new URL(value);
    return (
      url.searchParams.get("v") ||
      url.pathname.match(/^\/embed\/([^/?]+)/)?.[1] ||
      null
    );
  } catch {
    return null;
  }
}
export function readMetadata(doc = document): Song | null {
  const requested = videoId(doc.URL);
  const displayed = doc
    .querySelector("ytd-watch-flexy")
    ?.getAttribute("video-id");
  // During YouTube navigation its URL can change before the visible recording does.
  if (requested && displayed && requested !== displayed) return null;
  const domTitle = nativeText(
    doc.querySelector(
      "ytd-watch-metadata h1 yt-formatted-string, ytd-watch-metadata h1, #info-contents h1",
    ),
  );
  const canonicalUrl =
    doc.querySelector('meta[property="og:url"]')?.getAttribute("content") ||
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
    "";
  const canonicalId = videoId(canonicalUrl);
  const metaTitle =
    !requested || !canonicalId || canonicalId === requested
      ? doc.querySelector('meta[name="title"]')?.getAttribute("content") ||
        doc
          .querySelector('meta[property="og:title"]')
          ?.getAttribute("content") ||
        ""
      : "";
  // Matching canonical metadata also recovers native text when an extension prepends a plain label.
  const sameTitle =
    normalize(domTitle) === normalize(metaTitle) ||
    normalize(domTitle).endsWith(normalize(metaTitle));
  const title = metaTitle && (!domTitle || sameTitle) ? metaTitle : domTitle;
  const artist = nativeText(
    doc.querySelector(
      "ytd-video-owner-renderer #channel-name a, #owner #channel-name a",
    ),
  );
  const duration = doc.querySelector("video")?.duration;
  const song = parseMetadata(title, artist, duration);
  if (!song) return null;
  song.rawTitle = title;
  song.channel = artist;
  const mainParts = title.split(/\s*[|｜]\s*/)[0].split(/\s+[-–—]\s*|[-–—]\s+/);
  const channelMatches = (part: string) =>
    sameArtist(part, artist) ||
    artistCredits(part).some((name) => sameArtist(name, artist));
  if (
    mainParts.length > 1 &&
    !channelMatches(mainParts[0]) &&
    !channelMatches(mainParts[1]) &&
    !/[‘“'"].+[’”'"]/.test(title)
  ) {
    const alternative = parseMetadata(
      `${mainParts[1]} - ${mainParts[0]}`,
      "",
      duration,
    );
    if (alternative && normalize(alternative.title) !== normalize(song.title))
      song.alternatives = [
        {
          title: alternative.title,
          artist: alternative.artist,
          ...(alternative.artists ? { artists: alternative.artists } : {}),
        },
      ];
  }
  return song;
}
