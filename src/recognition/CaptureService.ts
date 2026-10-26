import type { Song } from "../model";

export type AudioStatus = "starting" | "capturing" | "recognizing" | "matched" | "no-match" | "stopped" | "error";
export interface AudioRecognitionStatus {
  type: "LYRICFLOW_AUDIO_STATUS";
  requestId: string;
  tabId: number;
  status: AudioStatus;
  message: string;
  song?: Song;
}
interface Session { requestId: string; tabId: number; url: string; timer?: ReturnType<typeof setTimeout> }
let active: Session | undefined;
let creating: Promise<void> | undefined;
const offscreenUrl = () => chrome.runtime.getURL("offscreen.html");
const terminal = new Set<AudioStatus>(["matched", "no-match", "stopped", "error"]);

async function notify(session: Session, status: AudioStatus, message: string, song?: Song) {
  const event: AudioRecognitionStatus = { type: "LYRICFLOW_AUDIO_STATUS", requestId: session.requestId, tabId: session.tabId, status, message, ...(song ? { song } : {}) };
  await chrome.tabs.sendMessage(session.tabId, event).catch(() => undefined);
  return event;
}
async function ensureOffscreen() {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [offscreenUrl()] });
    if (!contexts.length) await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK], justification: "Recognize an explicitly requested short tab-audio sample while preserving audible playback." });
  })();
  try { await creating; } finally { creating = undefined; }
}

/** Invoke only from chrome.action.onClicked, after the user has seen the audio-sharing disclosure. */
export async function startRecognition(tabId: number): Promise<AudioRecognitionStatus> {
  if (active) await stopRecognition(active.tabId);
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url ?? "https://invalid.local");
  if (!tab.active || url.origin !== "https://www.youtube.com" || url.pathname !== "/watch") throw new Error("Open an active YouTube watch page before recognizing audio.");
  const session: Session = { requestId: crypto.randomUUID(), tabId, url: url.href };
  active = session;
  await notify(session, "starting", "Preparing audio recognition. A short clip will be sent to AudD.");
  session.timer = setTimeout(() => { void stopRecognition(tabId, "Recognition timed out."); }, 30000);
  try {
    await ensureOffscreen();
    if (active !== session) return { type: "LYRICFLOW_AUDIO_STATUS", requestId: session.requestId, tabId, status: "stopped", message: "Recognition stopped." };
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const { auddToken } = await chrome.storage.local.get("auddToken");
    if (active !== session) return { type: "LYRICFLOW_AUDIO_STATUS", requestId: session.requestId, tabId, status: "stopped", message: "Recognition stopped." };
    const response = await chrome.runtime.sendMessage({ target: "lyricflow-offscreen", type: "AUDIO_START", requestId: session.requestId, tabId, streamId, token: typeof auddToken === "string" && auddToken.trim() ? auddToken.trim() : "test" });
    if (!response?.accepted) throw new Error("Audio capture could not start.");
    return { type: "LYRICFLOW_AUDIO_STATUS", requestId: session.requestId, tabId, status: "starting", message: "Audio recognition requested." };
  } catch (error) {
    if (active === session) {
      clearTimeout(session.timer); active = undefined;
      await chrome.runtime.sendMessage({ target: "lyricflow-offscreen", type: "AUDIO_STOP", requestId: session.requestId }).catch(() => undefined);
      return notify(session, "error", error instanceof Error ? error.message : "Audio recognition could not start.");
    }
    return { type: "LYRICFLOW_AUDIO_STATUS", requestId: session.requestId, tabId, status: "stopped", message: "Recognition stopped." };
  }
}

export async function stopRecognition(tabId: number, message = "Audio recognition stopped."): Promise<void> {
  const session = active;
  if (!session || session.tabId !== tabId) return;
  active = undefined;
  clearTimeout(session.timer);
  await chrome.runtime.sendMessage({ target: "lyricflow-offscreen", type: "AUDIO_STOP", requestId: session.requestId }).catch(() => undefined);
  await notify(session, "stopped", message);
}

/** Forward trusted offscreen events from background's runtime.onMessage listener. */
export function handleCaptureMessage(message: unknown, sender: chrome.runtime.MessageSender): boolean {
  if (!message || typeof message !== "object" || sender.id !== chrome.runtime.id || sender.tab || sender.url !== offscreenUrl()) return false;
  const event = message as Partial<AudioRecognitionStatus> & { target?: string };
  const session = active;
  if (event.target !== "lyricflow-background" || event.type !== "LYRICFLOW_AUDIO_STATUS" || !session || event.requestId !== session.requestId || event.tabId !== session.tabId || typeof event.message !== "string" || !event.status || !["starting", "capturing", "recognizing", "matched", "no-match", "stopped", "error"].includes(event.status)) return false;
  if (terminal.has(event.status)) { clearTimeout(session.timer); active = undefined; }
  void notify(session, event.status, event.message, event.song);
  return true;
}

chrome.tabs.onUpdated.addListener((tabId, change) => { if (active?.tabId === tabId && ((change.url && change.url !== active.url) || change.status === "loading")) void stopRecognition(tabId, "Recognition stopped because the video changed."); });
chrome.tabs.onRemoved.addListener((tabId) => { void stopRecognition(tabId); });
