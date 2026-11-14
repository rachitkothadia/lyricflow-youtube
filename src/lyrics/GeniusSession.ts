import { safeGeniusUrl } from "../model";
import { abortable } from "./requests";

export const geniusVerification =
  "Genius needs browser verification. Choose Connect Genius, finish the check in that tab, and keep it open.";
const storageKey = "geniusSession";
let connected: Session | undefined;
let connectedReady = false;
let currentPage: { url: string; body: string } | undefined;
const pageListeners = new Set<(page: { url: string; body: string }) => void>();
let restoring: Promise<void> = Promise.resolve();
export function restoreGeniusSession() {
  restoring = chrome.storage.session
    .get(storageKey)
    .then((value) => {
      if (!connected && validSession(value[storageKey]))
        connected = value[storageKey];
    })
    .catch(() => {});
}
async function restored(signal?: AbortSignal) {
  const wait = Promise.race([
    restoring,
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);
  if (signal) await abortable(wait, signal);
  else await wait;
}
type Session = { tabId: number; youtubeTabId: number };
const validSession = (value: any): value is Session =>
  Number.isInteger(value?.tabId) && Number.isInteger(value?.youtubeTabId);
const geniusOrigin = (url?: string) => {
  try {
    return new URL(url!).origin === "https://genius.com";
  } catch {
    return false;
  }
};

export async function connectGenius(youtubeTabId: number) {
  connectedReady = false;
  if (!connected) await restored();
  const session = connected;
  if (validSession(session)) {
    const tab = await chrome.tabs.get(session.tabId).catch(() => null);
    if (geniusOrigin(tab?.url)) {
      connected = { ...session, youtubeTabId };
      void chrome.storage.session.set({ [storageKey]: connected });
      await chrome.tabs.update(session.tabId, { active: true });
      // A previously verified page may already be open.
      void chrome.tabs
        .sendMessage(
          session.tabId,
          { type: "GENIUS_SESSION_CHECK" },
          { frameId: 0 },
        )
        .catch(() => {});
      return;
    }
  }
  // Register ownership before navigating, so even a fast page cannot race readiness.
  const tab = await chrome.tabs.create({ url: "about:blank", active: true });
  if (tab.id === undefined) throw new Error("Could not open Genius.");
  connected = { tabId: tab.id, youtubeTabId };
  void chrome.storage.session.set({ [storageKey]: connected });
  await chrome.tabs.update(tab.id, { url: "https://genius.com/" });
}

export async function geniusSessionReady(
  sender: chrome.runtime.MessageSender,
  message?: any,
) {
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !geniusOrigin(sender.url)
  )
    return;
  if (!connected) await restored();
  const session = connected;
  if (!validSession(session) || session.tabId !== sender.tab?.id) return;
  if (message?.result !== undefined) {
    let url: string;
    try {
      url = safeGeniusUrl(message.url);
    } catch {
      return;
    }
    if (
      url !== sender.url ||
      message.result?.status !== 200 ||
      typeof message.result.body !== "string" ||
      message.result.body.length > 2500000
    )
      return;
    currentPage = { url, body: message.result.body };
    for (const listener of pageListeners) listener(currentPage);
  }
  if (connectedReady) return;
  connectedReady = true;
  void chrome.tabs
    .sendMessage(session.youtubeTabId, { type: "GENIUS_CONNECTED" })
    .catch(() => {});
}

/** Use only the explicitly connected tab; never export its cookies or close user tabs. */
export async function sessionGeniusRequest(
  url: string,
  signal?: AbortSignal,
): Promise<Response | null> {
  signal?.throwIfAborted();
  if (!connected) await restored(signal);
  url = safeGeniusUrl(url);
  const target = new URL(url);
  const search =
    target.pathname === "/api/search" &&
    [...target.searchParams.keys()].every((k) => k === "q") &&
    !!target.searchParams.get("q") &&
    target.searchParams.get("q")!.length <= 300;
  if (!search && !/^\/[a-z\d%'-]+-lyrics$/i.test(target.pathname))
    throw new Error("Only Genius song and search requests are supported.");
  const session = connected;
  if (!validSession(session)) return null;
  const tab = await chrome.tabs.get(session.tabId).catch(() => null);
  if (!geniusOrigin(tab?.url)) {
    connected = undefined;
    currentPage = undefined;
    void chrome.storage.session.remove(storageKey);
    return null;
  }
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 10000);
  const bounded = AbortSignal.any([
    ...(signal ? [signal] : []),
    deadline.signal,
  ]);
  let result;
  let listener: (page: { url: string; body: string }) => void = () => {};
  const available = new Promise<{ url: string; body: string }>((resolve) => {
    listener = (page) => {
      if (page.url === url) resolve(page);
    };
    pageListeners.add(listener);
  });
  try {
    if (tab?.url !== url) {
      currentPage = undefined;
      await abortable(chrome.tabs.update(session.tabId, { url }), bounded);
    } else if (currentPage?.url !== url) {
      void chrome.tabs
        .sendMessage(
          session.tabId,
          { type: "GENIUS_SESSION_CHECK" },
          { frameId: 0 },
        )
        .catch(() => {});
    }
    const page =
      currentPage?.url === url
        ? currentPage
        : await abortable(available, bounded);
    result = { status: 200, body: page.body };
  } catch {
    if (signal?.aborted) throw signal.reason;
    connectedReady = false;
    throw new Error(geniusVerification);
  } finally {
    clearTimeout(timer);
    pageListeners.delete(listener);
  }
  return new Response(result.body, { status: result.status });
}
