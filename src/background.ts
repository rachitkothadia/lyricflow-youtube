import { validSong } from "./matching/identity";
import { validCorrection } from "./timing/preferences";
let timingWrites: Promise<unknown> = Promise.resolve();
import { GeniusWebProvider } from "./lyrics/GeniusWebProvider";
const geniusWeb = new GeniusWebProvider();
import { LrclibProvider, recordLyrics } from "./lyrics/LrclibProvider";
import {
  startRecognition,
  stopRecognition,
  handleCaptureMessage,
} from "./recognition/CaptureService";
const lyricsProvider = new LrclibProvider();
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) void startRecognition(tab.id).catch(() => undefined);
});
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (handleCaptureMessage(message, sender)) return false;
  if (
    sender.id === chrome.runtime.id &&
    sender.tab?.url?.startsWith("https://www.youtube.com/")
  ) {
    if (message?.type === "TIMING_LOAD" || message?.type === "TIMING_SAVE") {
      if (
        typeof message.key !== "string" ||
        !/^[\w-]{11}:[a-f0-9]{16}$/.test(message.key) ||
        (message.type === "TIMING_SAVE" && !validCorrection(message.profile))
      ) {
        reply({ error: "Invalid timing correction." });
        return false;
      }
      const operation = timingWrites
        .catch(() => {})
        .then(async () => {
          const stored = await chrome.storage.local.get("timingCorrections");
          const profiles: Record<string, any> =
            stored.timingCorrections &&
            typeof stored.timingCorrections === "object"
              ? stored.timingCorrections
              : {};
          if (message.type === "TIMING_LOAD")
            return {
              profile: validCorrection(profiles[message.key])
                ? profiles[message.key]
                : null,
            };
          if (!message.profile.base && !message.profile.fine)
            delete profiles[message.key];
          else
            profiles[message.key] = {
              base: message.profile.base,
              fine: message.profile.fine,
              updated: Date.now(),
            };
          const limited = Object.fromEntries(
            Object.entries(profiles)
              .sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0))
              .slice(0, 100),
          );
          await chrome.storage.local.set({ timingCorrections: limited });
          return { ok: true };
        });
      timingWrites = operation;
      void operation.then(reply).catch((e) => reply({ error: e.message }));
      return true;
    }
    if (message?.type === "TIMING_FIND") {
      if (!validSong(message.song)) {
        reply({ error: "Invalid song." });
        return false;
      }
      void lyricsProvider
        .resolve(message.song, AbortSignal.timeout(15000))
        .then(reply)
        .catch((e) => reply({ error: e.message }));
      return true;
    }
    if (message?.type === "GENIUS_PAGE") {
      if (!validSong(message.song)) {
        reply({ error: "Select a valid song first." });
        return false;
      }
      void geniusWeb
        .page(message.url, message.song, AbortSignal.timeout(15000))
        .then(reply)
        .catch((e) => reply({ error: e.message }));
      return true;
    }
    if (message?.type === "GENIUS_SEARCH") {
      void geniusWeb
        .search(message.query, AbortSignal.timeout(15000))
        .then((candidates) => reply({ candidates }))
        .catch((error) =>
          reply({
            error:
              error instanceof Error ? error.message : "Genius search failed.",
          }),
        );
      return true;
    }
    if (message?.type === "STOP_AUDIO") {
      void stopRecognition(sender.tab.id!);
      reply({ ok: true });
      return false;
    }
    if (message?.type === "LYRICS_RESOLVE" || message?.type === "LYRICS_GET") {
      const song = message.song;
      if (message.type === "LYRICS_RESOLVE" && !validSong(song)) {
        reply({ error: "Invalid song." });
        return false;
      }
      const signal = AbortSignal.timeout(30000);
      void (async () => {
        if (message.type === "LYRICS_GET") {
          if (message.provider === "genius")
            return geniusWeb.page(message.url, message.song, signal);
          return {
            kind: "ready",
            lyrics: await lyricsProvider.getById(message.id, signal),
          };
        }
        let result;
        let failure;
        try {
          result = await lyricsProvider.resolve(song, signal);
        } catch (error) {
          failure = error;
        }
        if (result?.kind === "ready") return result;
        try {
          const genius = await geniusWeb.resolve(song, signal);
          if (genius) return genius;
        } catch (error) {
          if (!result || result.kind === "not-found") throw error;
        }
        if (result) return result;
        throw failure;
      })()
        .then(reply)
        .catch((error) =>
          reply({
            error:
              error instanceof Error ? error.message : "Lyrics could not load.",
          }),
        );
      return true;
    }
  }
  return false;
});
