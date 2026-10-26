import { searchQueries, titleSimilarity } from "../matching/identity";
import { Candidate, Song, normalize, safeGeniusUrl } from "../model";
import {
  chooseCandidate,
  parseGeniusResults,
  rankCandidates,
} from "./GeniusProvider";
export type GeniusPage = {
  kind: "genius-page";
  html: string;
  url: string;
  song: Song;
};
/** Personal on-demand public-page reader. No challenge bypass, remote scripts, or saved lyric corpus. */
export class GeniusWebProvider {
  constructor(private transport: typeof fetch = geniusTransport) {}
  private async request(url: string, signal: AbortSignal) {
    const response = await this.transport(safeGeniusUrl(url), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Genius declined this request. Open the source page in your browser."
          : `Genius returned ${response.status}.`,
      );
    const text = await response.text();
    if (text.length > 2500000)
      throw new Error("Genius response was too large.");
    return text;
  }
  async page(
    url: string,
    song: Song,
    signal: AbortSignal,
  ): Promise<GeniusPage> {
    url = safeGeniusUrl(url);
    if (!/^\/[a-z\d%'-]+-lyrics$/i.test(new URL(url).pathname))
      throw new Error("Use a Genius song lyrics page.");
    const html = await this.request(url, signal);
    if (!/data-lyrics-container|class=["']lyrics["']/i.test(html))
      throw new Error("Genius did not return readable lyrics for this page.");
    return { kind: "genius-page", html, url, song };
  }
  async resolve(
    song: Song,
    signal: AbortSignal,
  ): Promise<
    GeniusPage | { kind: "ambiguous"; candidates: Candidate[] } | null
  > {
    const found = new Map<number, Candidate>();
    for (const query of searchQueries(song)) {
      const data = JSON.parse(
        await this.request(
          "https://genius.com/api/search?" + new URLSearchParams({ q: query }),
          signal,
        ),
      );
      for (const c of parseGeniusResults(data))
        found.set(c.id, { ...c, provider: "genius" });
      const chosen = chooseCandidate(song, [...found.values()]);
      if (chosen)
        return this.page(
          chosen.url,
          { ...chosen, duration: song.duration },
          signal,
        );
    }
    const candidates = [...found.values()];
    const ranked = rankCandidates(song, candidates).filter(
      (c) => c.score! >= 0.55 || titleSimilarity(song.title, c.title) >= 0.9,
    );
    return ranked.length
      ? { kind: "ambiguous", candidates: ranked.slice(0, 5) }
      : null;
  }
}

async function geniusTransport(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  init?.signal?.throwIfAborted();
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime?.id &&
    chrome.runtime.sendNativeMessage
  ) {
    try {
      const result = await chrome.runtime.sendNativeMessage(
        "com.lyricflow.genius",
        { url: String(input) },
      );
      init?.signal?.throwIfAborted();
      if (result?.error) throw new Error(result.error);
      return new Response(result.body, { status: result.status });
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      if (
        error instanceof Error &&
        !/not found|not registered|host has exited|failed to start/i.test(
          error.message,
        )
      )
        throw error;
      throw new Error(
        "Install the LyricFlow local reader once to load Genius lyrics on this computer.",
      );
    }
  }
  return fetch(input, init);
}
