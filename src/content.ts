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
import {
  PlaybackSynchronizer,
  lyricSeekTime,
} from "./timing/PlaybackSynchronizer";
import { parseImport } from "./lyrics/parse";
import { demo } from "./fixtures";
import { Candidate, Lyrics, Song, normalize } from "./model";
import {
  watchVideo as findWatchVideo,
  playingAd,
  recordingDuration,
} from "./youtube/media";
import {
  timingKey,
  validCorrection,
  calibrationOffset,
} from "./timing/preferences";
import { artistCredits } from "./matching/identity";
import { alignLyrics } from "./lyrics/LyricsMatcher";
import { videoCaptions, alignCaptionTiming } from "./timing/YouTubeCaptions";
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
    offset = 0,
    alignment = 0,
    correctionKey = "",
    adjustmentRevision = 0;
  let captionRequest: AbortController | undefined;
  let observedVideo: HTMLVideoElement | null = null;
  let observedPlayer: Element | null = null;
  let playerObserver: MutationObserver | undefined;
  let mediaTimer: ReturnType<typeof setTimeout> | undefined;
  let durationWait: ReturnType<typeof setTimeout> | undefined;
  let durationWaitExpired = false;
  const timingLookups = new Set<string>();
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
    if (type === "TIMING_LOAD") return { profile: null };
    if (type === "TIMING_SAVE") return { ok: true };
    if (type === "LYRICS_GET")
      return {
        kind: "ready",
        lyrics: await provider.getById((payload as Candidate).id, signal),
      };
    return provider.resolve((payload as { song: Song }).song, signal);
  }
  async function prepare(data: Lyrics, seq: number) {
    const nextKey = timingKey(key, data, recordingDuration(video)),
      revision = adjustmentRevision;
    let saved: any;
    if (nextKey)
      try {
        saved = await rpc("TIMING_LOAD", { key: nextKey }, request.signal);
      } catch {}
    const result = await romanizeLines(data.lines, { language });
    if (disposed || seq !== generation) return;
    correctionKey = nextKey;
    if (revision === adjustmentRevision && validCorrection(saved?.profile)) {
      alignment = saved.profile.base;
      offset = saved.profile.fine;
    }
    original = data;
    bind({
      ...data,
      lines: result.lines,
      romanized: !result.unsupported.length,
      romanization: result.mode,
      romanizationSystems: [...result.systems, ...result.unsupported],
    });
    panel.timingCorrection(alignment, offset, true);
    const lookupKey = key + ":" + data.sourceUrl;
    if (
      (data.provenance === "genius" || data.provenance === "lrclib") &&
      data.lines.every((l) => l.time === undefined) &&
      !timingLookups.has(lookupKey)
    ) {
      timingLookups.add(lookupKey);
      void recoverTiming(data, result.lines, seq);
    }
  }
  async function recoverTiming(
    data: Lyrics,
    readable: Lyrics["lines"],
    seq: number,
  ) {
    try {
      const primary =
        (data.song.artists || artistCredits(data.song.artist))[0] ||
        data.song.artist;
      const song = {
        ...data.song,
        artist: primary,
        artists: [primary],
        duration: recordingDuration(video),
      };
      const found = await rpc("TIMING_FIND", { song }, request.signal);
      if (disposed || seq !== generation) return;
      if (found.kind === "ready") {
        if (found.lyrics.lines.every((l: any) => l.time !== undefined)) {
          const converted = await romanizeLines(found.lyrics.lines, {
            language,
          });
          if (disposed || seq !== generation) return;
          const aligned = alignLyrics(readable, converted.lines);
          if (aligned.lines.every((l) => l.time !== undefined)) {
            await prepare(
              {
                ...data,
                lines: data.lines.map((l, i) => ({
                  ...l,
                  time: aligned.lines[i].time,
                  ...(aligned.lines[i].endTime !== undefined
                    ? { endTime: aligned.lines[i].endTime }
                    : {}),
                })),
                timingSource: {
                  url: found.lyrics.sourceUrl,
                  label: "LRCLIB · matching lyric lines",
                },
              },
              seq,
            );
            return;
          }
          const id = Number(
            new URL(found.lyrics.sourceUrl).pathname.split("/").at(-1),
          );
          if (Number.isSafeInteger(id) && id > 0)
            panel.setTimingCandidates([
              {
                ...found.lyrics.song,
                id,
                url: found.lyrics.sourceUrl,
                provider: "lrclib",
                romanized: found.lyrics.romanized,
                timed: true,
              },
            ]);
        } else panel.setTimingCandidates(found.lyrics.timingCandidates || []);
      } else if (found.kind === "ambiguous")
        panel.setTimingCandidates(
          found.candidates.filter((c: Candidate) => c.timed),
        );
    } catch {
      /* Keep readable source text when an optional timing lookup fails. */
    }
  }
  const mediaChanged = () => {
    clearTimeout(mediaTimer);
    mediaTimer = setTimeout(() => {
      sync?.setOffset(alignment + offset);
      reconcile();
    }, 100);
  };
  function attachVideo(value: HTMLVideoElement | null) {
    if (observedVideo !== value) {
      for (const event of ["loadedmetadata", "durationchange", "emptied"])
        observedVideo?.removeEventListener(event, mediaChanged);
      observedVideo = value;
      for (const event of ["loadedmetadata", "durationchange", "emptied"])
        value?.addEventListener(event, mediaChanged);
    }
    const player = value?.closest(".html5-video-player,#movie_player") || null;
    if (player !== observedPlayer) {
      playerObserver?.disconnect();
      observedPlayer = player;
      if (player) {
        playerObserver = new MutationObserver(mediaChanged);
        playerObserver.observe(player, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    }
    video = value;
  }
  function saveCorrection() {
    if (!correctionKey) return;
    const selectedKey = correctionKey;
    void rpc(
      "TIMING_SAVE",
      { key: selectedKey, profile: { base: alignment, fine: offset } },
      request.signal,
    ).catch(() => {
      if (selectedKey === correctionKey)
        panel.timingError("Timing applied, but could not save the correction.");
    });
  }
  function reset() {
    request.abort();
    captionRequest?.abort();
    captionRequest = undefined;
    request = new AbortController();
    generation++;
    sync?.dispose();
    sync = undefined;
    loaded = undefined;
    original = undefined;
    offset = 0;
    alignment = 0;
    correctionKey = "";
    adjustmentRevision++;
    panel.resetOffset();
  }
  function bind(data: Lyrics) {
    loaded = data;
    sync?.dispose();
    panel.lyrics(data);
    attachVideo(findWatchVideo());
    if (video) {
      sync = new PlaybackSynchronizer(video, data.lines, (i) =>
        panel.active(i),
      );
      sync.setOffset(alignment + offset);
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
    const duration = recordingDuration(video);
    if (
      loaded &&
      candidate.timed &&
      duration &&
      candidate.duration &&
      Math.abs(duration - candidate.duration) > 8 &&
      !alignment
    )
      panel.timingError(
        "Different timed edition · match a line to the music in options.",
      );
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
      clearTimeout(durationWait);
      durationWait = undefined;
      durationWaitExpired = false;
      reset();
      current = null;
      attachVideo(findWatchVideo());
      if (!newKey) {
        panel.state("initial");
        return;
      }
      panel.state("detecting");
    }
    const found = findWatchVideo();
    const replaced = found !== video;
    attachVideo(found);
    if (replaced && loaded) bind(loaded);
    if (key && automatic) {
      if (playingAd(video)) return;
      const song = readMetadata();
      if (song && !song.duration && video && !durationWaitExpired) {
        if (!durationWait) {
          panel.state("detecting", song);
          durationWait = setTimeout(() => {
            durationWaitExpired = true;
            reconcile();
          }, 1200);
        }
        return;
      }
      const changedDuration =
        song?.duration &&
        (!current?.duration || Math.abs(song.duration - current.duration) > 1);
      if (
        song &&
        (!current ||
          identityKey(song) !== identityKey(current) ||
          changedDuration)
      ) {
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
    automatic = false;
    const song = current || { artist: "", title: "Genius lyrics", version: "" };
    reset();
    panel.state("loading", song);
    const seq = generation;
    try {
      const result = await rpc("GENIUS_PAGE", { url, song }, request.signal);
      if (seq === generation) {
        const data = readGeniusPage(result.html, result.url, song, true);
        current = data.song;
        await prepare(data, seq);
      }
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
    adjustmentRevision++;
    offset = v;
    sync?.setOffset(alignment + offset);
    panel.timingCorrection(alignment, offset);
    saveCorrection();
  };
  panel.onResetTiming = () => {
    alignment = 0;
  };
  panel.onCalibrate = (time) => {
    if (!video || playingAd(video)) {
      panel.timingError("Wait for the song to resume, then align a line.");
      return;
    }
    try {
      alignment = calibrationOffset(video.currentTime, time);
      offset = 0;
      adjustmentRevision++;
      sync?.setOffset(alignment);
      panel.timingCorrection(alignment, 0, true);
      saveCorrection();
    } catch (error) {
      panel.timingError(
        error instanceof Error ? error.message : "Could not align this line.",
      );
    }
  };
  panel.onVideoTiming = async () => {
    if (!original || !loaded || !video || playingAd(video)) {
      panel.timingError("Load the song and wait for playback to resume first.");
      return;
    }
    captionRequest?.abort();
    const captionsController = new AbortController();
    captionRequest = captionsController;
    const seq = ++generation,
      data = original,
      readable = loaded.lines;
    panel.timingError("Checking the video captions for matching timing…");
    try {
      const captions = await videoCaptions(
        key,
        AbortSignal.any([request.signal, captionsController.signal]),
      );
      const converted = await romanizeLines(captions.lines, { language });
      if (disposed || seq !== generation) return;
      const timed = alignCaptionTiming(readable, converted.lines);
      alignment = 0;
      offset = 0;
      await prepare(
        {
          ...data,
          lines: data.lines.map((line, i) => ({
            ...line,
            time: timed[i].time,
            endTime: timed[i].endTime,
          })),
          timingSource: { url: captions.url, label: captions.label },
        },
        seq,
      );
    } catch (error) {
      if (!disposed && seq === generation)
        panel.timingError(
          error instanceof Error
            ? error.message
            : "No verified video timing is available.",
        );
    } finally {
      if (captionRequest === captionsController) captionRequest = undefined;
    }
  };
  panel.onSeek = (time) => {
    if (
      !video ||
      playingAd(video) ||
      !loaded?.lines.every((line) => line.time !== undefined)
    )
      return;
    const ranges = Array.from({ length: video.seekable.length }, (_, i) => ({
      start: video!.seekable.start(i),
      end: video!.seekable.end(i),
    }));
    const target = lyricSeekTime(
      time,
      alignment + offset,
      video.duration,
      ranges,
    );
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
      const seq = generation;
      void prepare(data, seq).catch((error) => {
        if (!disposed && seq === generation)
          panel.state(
            "error",
            data.song,
            error instanceof Error ? error.message : "Import failed.",
          );
      });
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
    attachVideo(null);
    clearTimeout(mediaTimer);
    clearTimeout(durationWait);
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
