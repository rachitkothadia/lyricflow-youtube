import type { AudioStatus } from "./CaptureService";
import type { Song } from "../model";

interface Capture {
  requestId: string; tabId: number; cancelled: boolean; stream?: MediaStream;
  context?: AudioContext; source?: MediaStreamAudioSourceNode; recorder?: MediaRecorder;
  chunks: Blob[]; bytes: number; timer?: ReturnType<typeof setTimeout>; controller: AbortController;
  failure?: string;
}
let current: Capture | undefined;
const MAX_BYTES = 2 * 1024 * 1024;
async function report(capture: Capture, status: AudioStatus, message: string, song?: Song) {
  await chrome.runtime.sendMessage({ target: "lyricflow-background", type: "LYRICFLOW_AUDIO_STATUS", requestId: capture.requestId, tabId: capture.tabId, status, message, ...(song ? { song } : {}) }).catch(() => undefined);
}
async function releaseAudio(capture: Capture) {
  clearTimeout(capture.timer);
  const { stream, source, context } = capture;
  capture.stream = undefined; capture.source = undefined; capture.context = undefined;
  stream?.getTracks().forEach(track => track.stop());
  source?.disconnect();
  if (context && context.state !== "closed") await context.close().catch(() => undefined);
}
async function cancel(capture: Capture) {
  capture.cancelled = true; capture.controller.abort();
  if (capture.recorder?.state !== "inactive") capture.recorder?.stop();
  await releaseAudio(capture);
  capture.chunks.length = 0;
  if (current === capture) current = undefined;
}
async function recognize(capture: Capture) {
  await releaseAudio(capture);
  if (capture.cancelled) return;
  try {
    if (capture.failure) throw new Error(capture.failure);
    const clip = new Blob(capture.chunks, { type: capture.recorder?.mimeType || "audio/webm" });
    capture.chunks.length = 0;
    if (!clip.size || clip.size > MAX_BYTES) throw new Error("Audio clip was empty or exceeded the 2 MB limit.");
    await report(capture, "recognizing", "Capture finished. AudD is identifying the short clip.");
    const data = new FormData();
    data.append("api_token", tokens.get(capture.requestId) ?? "test");
    tokens.delete(capture.requestId);
    data.append("file", clip, "lyricflow-sample.webm");
    const timeout = setTimeout(() => capture.controller.abort(), 15000);
    let body: { status?: string; result?: { artist?: unknown; title?: unknown; album?: unknown } | null; error?: { error_code?: unknown } };
    try {
      const response = await fetch("https://api.audd.io/", { method: "POST", body: data, signal: capture.controller.signal, credentials: "omit", redirect: "error" });
      if (!response.ok) throw new Error(response.status === 429 ? "AudD quota reached. Try later or add your own API token." : `Audio recognition service failed (${response.status}).`);
      const text = await response.text();
      if (text.length > 1000000) throw new Error("Recognition response exceeded the size limit.");
      body = JSON.parse(text);
    } finally { clearTimeout(timeout); }
    if (capture.cancelled) return;
    if (body.status !== "success") throw new Error(`AudD could not recognize this clip (provider error ${String(body.error?.error_code ?? "unknown").slice(0, 20)}). The shared test quota may be exhausted; add your own token or retry later.`);
    if (!body.result) { await report(capture, "no-match", "No song match for this clip. Try a clear musical section."); return; }
    const { title, artist } = body.result;
    if (typeof title !== "string" || typeof artist !== "string" || !title.trim() || !artist.trim()) throw new Error("AudD returned incomplete song metadata.");
    await report(capture, "matched", "Song identified from audio by AudD.", { title: title.slice(0, 250), artist: artist.slice(0, 250), version: "" });
  } catch (error) {
    if (!capture.cancelled) await report(capture, "error", capture.controller.signal.aborted ? "AudD request timed out. Audio was discarded." : error instanceof Error ? error.message : "Audio recognition failed.");
  } finally {
    tokens.delete(capture.requestId); capture.chunks.length = 0; capture.recorder = undefined;
    if (current === capture) current = undefined;
  }
}
const tokens = new Map<string, string>();
async function start(requestId: string, tabId: number, streamId: string, token: string) {
  if (current) { tokens.delete(current.requestId); await cancel(current); }
  const capture: Capture = { requestId, tabId, cancelled: false, chunks: [], bytes: 0, controller: new AbortController() };
  current = capture; tokens.set(requestId, token);
  try {
    const constraints = { audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } }, video: false } as unknown as MediaStreamConstraints;
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (capture.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
    capture.stream = stream;
    capture.timer = setTimeout(() => {
      if (capture.recorder?.state === "recording") capture.recorder.stop();
      else { void report(capture, "error", "Audio setup timed out; capture stopped."); tokens.delete(requestId); void cancel(capture); }
    }, 10000);
    capture.context = new AudioContext();
    capture.source = capture.context.createMediaStreamSource(stream);
    capture.source.connect(capture.context.destination);
    await capture.context.resume();
    if (capture.context.state !== "running") throw new Error("Could not preserve audible playback; capture stopped.");
    if (capture.cancelled) return;
    const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("This Chrome version cannot encode the required audio clip.");
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96000 });
    capture.recorder = recorder;
    recorder.ondataavailable = event => {
      if (capture.cancelled || !event.data.size) return;
      capture.bytes += event.data.size;
      if (capture.bytes > MAX_BYTES) { capture.failure = "Audio clip exceeded the 2 MB limit."; if (recorder.state !== "inactive") recorder.stop(); return; }
      capture.chunks.push(event.data);
    };
    recorder.onerror = () => { capture.failure = "Chrome could not record the tab audio."; if (recorder.state !== "inactive") recorder.stop(); else void recognize(capture); };
    recorder.onstop = () => { void recognize(capture); };
    stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => { if (!capture.cancelled && recorder.state !== "inactive") { capture.failure = "Tab audio ended before recognition completed."; recorder.stop(); } }, { once: true }));
    recorder.start(250);
    await report(capture, "capturing", "Recognizing audio: recording up to 10 seconds for AudD. Use Stop to cancel.");
  } catch (error) {
    if (!capture.cancelled) await report(capture, "error", error instanceof Error ? error.message : "Tab audio capture failed.");
    tokens.delete(requestId); await cancel(capture);
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL("background.js") && sender.url !== undefined || message?.target !== "lyricflow-offscreen") return false;
  if (message.type === "AUDIO_STOP" && typeof message.requestId === "string") {
    const capture = current;
    if (capture && capture.requestId === message.requestId) { tokens.delete(capture.requestId); void cancel(capture); }
    reply({ accepted: true }); return false;
  }
  if (message.type !== "AUDIO_START" || typeof message.requestId !== "string" || !Number.isInteger(message.tabId) || typeof message.streamId !== "string" || typeof message.token !== "string") return false;
  reply({ accepted: true });
  void start(message.requestId, message.tabId, message.streamId, message.token);
  return false;
});
