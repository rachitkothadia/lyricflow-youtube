import { identityKey } from "./matching/identity";
import { readGeniusPage } from "./lyrics/GeniusPage";
import { YouTubeLayoutAdapter } from "./youtube/YouTubeLayoutAdapter";
import {
  readMetadata,
  parseMetadata,
} from "./recognition/YouTubeMetadataRecognizer";
import { LrclibProvider, recordLyrics } from "./lyrics/LrclibProvider";
import { romanizeLines } from "./lyrics/romanize";
import { LyricsPanel } from "./ui/LyricsPanel";
import { PlaybackSynchronizer, lyricSeekTime } from "./timing/PlaybackSynchronizer";
import { parseImport } from "./lyrics/parse";
import { demo } from "./fixtures";
import { Candidate, Lyrics, Song, normalize } from "./model";
export function start() {
  let disposed = false,
    automatic = true,
    request = new AbortController(),
    sync: PlaybackSynchronizer | undefined,
    video: HTMLVideoElement | null = null,
    key = "",
    generation = 0,
    current: Song | null = null,
    loaded: Lyrics | undefined,
    offset = 0;
  const layout = new YouTubeLayoutAdapter(reconcile);
  const panel = new LyricsPanel(layout.root.shadowRoot!);
  const provider = new LrclibProvider();
  let language: "ja" | "zh" | "ko" | undefined;
  let original: Lyrics | undefined;
  async function rpc(type: string, payload: object, signal: AbortSignal) {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      const result = await chrome.runtime.sendMessage({ type, ...payload });
      if (result?.error) throw new Error(result.error);
      return result;
    }
    if (type === "LYRICS_GET")
      return {
        kind: "ready",
        lyrics: await provider.getById((payload as Candidate).id, signal),
      };
    return provider.resolve((payload as { song: Song }).song, signal);
  }
  async function prepare(data: Lyrics, seq: number) {
    const result = await romanizeLines(data.lines, { language });
    if (disposed || seq !== generation) return;
    original = data;
    bind({
      ...data,
      lines: result.lines,
      romanized: !result.unsupported.length,
      romanization: result.mode,
      romanizationSystems: [...result.systems, ...result.unsupported],
    });
  }
  function reset() {
    request.abort();
    request = new AbortController();
    generation++;
    sync?.dispose();
    sync = undefined;
    loaded = undefined;
    original = undefined;
    offset = 0;
    panel.resetOffset();
  }
  function bind(data: Lyrics) {
    loaded = data;
    sync?.dispose();
    panel.lyrics(data);
    video = document.querySelector("video");
    if (video) {
      sync = new PlaybackSynchronizer(video, data.lines, (i) =>
        panel.active(i),
      );
      sync.setOffset(offset);
    }
  }
  async function load(song: Song, id?: number, candidate?: Candidate) {
    reset();
    current = song;
    panel.state("loading", song);
    const seq = generation,
      signal = request.signal;
    try {
      const result = await rpc(
        id ? "LYRICS_GET" : "LYRICS_RESOLVE",
        id
          ? { id, provider: candidate?.provider, url: candidate?.url, song }
          : { song },
        signal,
      );
      if (signal.aborted || seq !== generation) return;
      if (result.kind === "ready") await prepare(result.lyrics, seq);
      else if (result.kind === "genius-page")
        await prepare(
          readGeniusPage(result.html, result.url, result.song),
          seq,
        );
      else if (result.kind === "ambiguous")
        panel.showCandidates(song, result.candidates);
      else panel.state("no-results", song, result.message);
    } catch (e) {
      if (signal.aborted || seq !== generation) return;
      panel.state(
        "unavailable",
        song,
        e instanceof Error ? e.message : "Lyrics could not be loaded.",
      );
    }
  }
  async function search(query: string) {
    automatic = false;
    const song = parseMetadata(query, "");
    if (song) await load(song);
  }
  async function select(candidate: Candidate) {
    automatic = false;
    await load(candidate, candidate.id, candidate);
  }
  function reconcile() {
    if (disposed) return;
    const newKey =
      location.pathname === "/watch"
        ? new URL(location.href).searchParams.get("v") || ""
        : "";
    if (newKey !== key) {
      key = newKey;
      automatic = true;
      reset();
      current = null;
      video = document.querySelector("video");
      if (!newKey) {
        panel.state("initial");
        return;
      }
      panel.state("detecting");
    }
    const found = document.querySelector<HTMLVideoElement>("video");
    if (found !== video) {
      video = found;
      if (loaded) bind(loaded);
    }
    if (key && automatic) {
      const song = readMetadata();
      if (song && (!current || identityKey(song) !== identityKey(current))) {
        current = song;
        void load(song);
      }
    }
    layout.root.setAttribute(
      "theme",
      document.documentElement.hasAttribute("dark") ? "dark" : "light",
    );
  }
  panel.onGenius = async (url) => {
    if (!current) return;
    automatic = false;
    const song = current;
    reset();
    panel.state("loading", song);
    const seq = generation;
    try {
      const result = await rpc("GENIUS_PAGE", { url, song }, request.signal);
      if (seq === generation)
        await prepare(readGeniusPage(result.html, result.url, song), seq);
    } catch (e) {
      if (seq === generation)
        panel.state(
          "error",
          song,
          e instanceof Error ? e.message : "Genius could not load.",
        );
    }
  };
  panel.onLanguage = (value) => {
    language = (value as typeof language) || undefined;
    if (original) void prepare(original, ++generation);
  };
  const audio = (message: any) => {
    if (message?.type !== "LYRICFLOW_AUDIO_STATUS") return;
    panel.audioStatus(message.message);
    if (message.status === "matched" && message.song) {
      automatic = false;
      void load(message.song);
    }
  };
  if (typeof chrome !== "undefined" && chrome.runtime?.id)
    chrome.runtime.onMessage.addListener(audio);
  panel.onStopAudio = () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.id)
      void chrome.runtime.sendMessage({ type: "STOP_AUDIO" });
  };
  panel.onRetry = () => {
    automatic = true;
    current = null;
    reset();
    reconcile();
  };
  panel.onSearch = (q) => void search(q);
  panel.onChoose = (c) => void select(c);
  panel.onDemo = () => {
    automatic = false;
    reset();
    current = demo.song;
    bind(demo);
  };
  panel.onOffset = (v) => {
    offset = v;
    sync?.setOffset(v);
  };
  panel.onSeek = (time) => {
    if (!video || !loaded?.lines.every(line => line.time !== undefined)) return;
    const ranges = Array.from({length: video.seekable.length}, (_, i) => ({start: video!.seekable.start(i), end: video!.seekable.end(i)}));
    const target = lyricSeekTime(time, offset, video.duration, ranges);
    if (target === null) return;
    video.currentTime = target;
    void video.play().catch(() => {});
  };
  panel.onImport = (raw) => {
    try {
      const data = parseImport(raw);
      if (
        current &&
        current !== demo.song &&
        (normalize(current.title) !== normalize(data.song.title) ||
          normalize(current.artist) !== normalize(data.song.artist) ||
          normalize(current.version) !== normalize(data.song.version))
      )
        throw new Error(
          "Import does not match the selected song and recording. Correct the song first.",
        );
      reset();
      automatic = false;
      current = data.song;
      bind(data);
    } catch (e) {
      sync?.dispose();
      sync = undefined;
      panel.state(
        "error",
        current || undefined,
        e instanceof Error ? e.message : "Import failed.",
      );
    }
  };
  const navigation = () => {
    layout.reconcile();
    reconcile();
  };
  document.addEventListener("yt-navigate-finish", navigation);
  document.addEventListener("yt-page-data-updated", navigation);
  window.addEventListener("popstate", navigation);
  const theme = new MutationObserver(() => reconcile());
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["dark"],
  });
  layout.mount();
  reconcile();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (typeof chrome !== "undefined" && chrome.runtime?.id)
      chrome.runtime.onMessage.removeListener(audio);
    reset();
    layout.dispose();
    panel.dispose();
    theme.disconnect();
    document.removeEventListener("yt-navigate-finish", navigation);
    document.removeEventListener("yt-page-data-updated", navigation);
    window.removeEventListener("popstate", navigation);
    window.removeEventListener("pagehide", dispose);
  };
  window.addEventListener("pagehide", dispose);
  return { dispose };
}
