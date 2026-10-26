import { Lyrics, LyricLine, Song, safeGeniusUrl, normalize } from "../model";
import { artistCredits, cleanTitle } from "../matching/identity";
import { recordingVersion } from "./LrclibProvider";
/** Parse inert provider HTML; render text nodes only, never provider markup or scripts. */
export function readGeniusPage(
  html: string,
  url: string,
  expected: Song,
  manual = false,
): Lyrics {
  if (html.length > 2500000) throw new Error("Genius response was too large.");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const containers = [
    ...doc.querySelectorAll('[data-lyrics-container="true"]'),
  ];
  if (!containers.length) {
    const legacy = doc.querySelector(".lyrics");
    if (legacy) containers.push(legacy);
  }
  if (!containers.length)
    throw new Error("No readable lyrics were returned by Genius.");
  const pageTitle = doc
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  let song = expected;
  if (manual) {
    const identity = (pageTitle || doc.title)
      .replace(/\s*[|｜].*$/, "")
      .match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (identity) {
      let artist = identity[1].trim(),
        title = identity[2].trim().replace(/\s+Lyrics$/i, "");
      if (normalize(artist) === "genius romanizations") {
        const recording = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
        if (recording) {
          artist = recording[1];
          title = recording[2];
        }
      }
      const artists = artistCredits(artist);
      song = {
        artist: artist.slice(0, 300),
        title: cleanTitle(title).slice(0, 300),
        version: recordingVersion(title),
        ...(artists.length > 1 ? { artists } : {}),
      };
    } else song = { artist: "", title: "Genius lyrics", version: "" };
  }
  if (
    !manual &&
    pageTitle &&
    !normalize(pageTitle).includes(
      normalize(expected.title.replace(/\s*[([]romanized[)\]]\s*$/i, "")),
    )
  )
    throw new Error(
      "This Genius page does not match the selected song. Correct the song first.",
    );
  const lines: LyricLine[] = [];
  let section = "";
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (!(node instanceof Element)) return "";
    if (
      ["SCRIPT", "STYLE", "IFRAME", "BUTTON", "SVG", "RT"].includes(
        node.tagName,
      ) ||
      node.getAttribute("aria-hidden") === "true"
    )
      return "";
    if (node.tagName === "BR") return "\n";
    const content = [...node.childNodes].map(read).join("");
    return ["P", "DIV"].includes(node.tagName) ? content + "\n" : content;
  };
  for (const container of containers)
    for (const raw of read(container).split(/\r?\n/)) {
      const text = raw.replace(/\u200b/g, "").trim();
      if (!text) continue;
      if (/^\[[^\]]{1,150}\]$/.test(text)) {
        section = text.slice(1, -1);
        continue;
      }
      if (/^(You might also like|\d*\s*Embed)$/i.test(text)) continue;
      if (text.length > 2000)
        throw new Error("Genius returned an invalid lyric line.");
      lines.push({ text, ...(section ? { section } : {}) });
    }
  if (!lines.length || lines.length > 1000)
    throw new Error("Genius returned an invalid number of lyric lines.");
  return {
    song,
    lines,
    sourceUrl: safeGeniusUrl(url),
    sourceLabel: "Genius",
    provenance: "genius",
    romanized: !lines.some((l) =>
      /(?:(?!\p{Script=Latin})\p{L})/u.test(l.text),
    ),
  };
}
