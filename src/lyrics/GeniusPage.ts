import { Lyrics, LyricLine, Song, safeGeniusUrl, normalize } from "../model";
/** Parse inert provider HTML; render text nodes only, never provider markup or scripts. */
export function readGeniusPage(
  html: string,
  url: string,
  expected: Song,
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
  if (
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
    song: expected,
    lines,
    sourceUrl: safeGeniusUrl(url),
    sourceLabel: "Genius",
    provenance: "genius",
    romanized: !lines.some((l) =>
      /(?:(?!\p{Script=Latin})\p{L})/u.test(l.text),
    ),
  };
}
