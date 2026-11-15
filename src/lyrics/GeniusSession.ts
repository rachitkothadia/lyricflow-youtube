import { safeGeniusUrl } from "../model";
import { abortable, extensionCall } from "./requests";

const tabs = {
  get: (id: number) =>
    extensionCall<chrome.tabs.Tab>((done) => chrome.tabs.get(id, done)),
  create: (value: any) =>
    extensionCall<chrome.tabs.Tab>((done) => chrome.tabs.create(value, done)),
  update: (id: number, value: any) =>
    extensionCall<chrome.tabs.Tab | undefined>((done) =>
      chrome.tabs.update(id, value, done),
    ),
  remove: (id: number) =>
    extensionCall<void>((done) => chrome.tabs.remove(id, done)),
  sendMessage: (id: number, value: any, options: any = {}) =>
    extensionCall<any>((done) =>
      chrome.tabs.sendMessage(id, value, options, done),
    ),
};
const storage = {
  get: (key: string) =>
    extensionCall<Record<string, any>>((done) =>
      chrome.storage.session.get(key, done),
    ),
  set: (value: Record<string, any>) =>
    extensionCall<void>((done) => chrome.storage.session.set(value, done)),
  remove: (key: string) =>
    extensionCall<void>((done) => chrome.storage.session.remove(key, done)),
};
export const geniusVerification =
  "Genius needs browser verification. Choose Connect Genius and finish the check in that tab.";
const storageKey = "geniusSession";
type Session = {
  tabId: number;
  youtubeTabId?: number;
  automatic?: boolean;
  needsVerification?: boolean;
};
type Page = { url: string; body?: string; verification?: true; error?: string };
let connected: Session | undefined;
let connectedReady = false;
let currentPage: Page | undefined;
let blankTabId: number | undefined;
let requestedUrl: string | undefined;
let restoring: Promise<void> = Promise.resolve();
let opening: Promise<Session> | undefined;
let queue: Promise<unknown> = Promise.resolve();
let jobs = 0;
let revision = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
const pageListeners = new Set<(page: Page) => void>();
const validSession = (value: any): value is Session =>
  Number.isInteger(value?.tabId) &&
  (Number.isInteger(value?.youtubeTabId) || value?.automatic === true);
const geniusOrigin = (url?: string) => {
  try {
    return new URL(url!).origin === "https://genius.com";
  } catch {
    return false;
  }
};
const ownedUrl = (url?: string) => geniusOrigin(url) || url === "about:blank";
const ownedTab = (tab: chrome.tabs.Tab | null, session: Session) =>
  !!tab &&
  (ownedUrl(tab.url) ||
    geniusOrigin(tab.pendingUrl) ||
    blankTabId === session.tabId);
const save = () => {
  if (connected)
    void chrome.storage.session
      .set({ [storageKey]: connected })
      .catch(() => {});
};
function clear(session: Session) {
  if (connected !== session) return;
  revision++;
  connected = undefined;
  connectedReady = false;
  currentPage = undefined;
  if (blankTabId === session.tabId) blankTabId = undefined;
  void storage.remove(storageKey).catch(() => {});
}
export function restoreGeniusSession() {
  const version = revision;
  restoring = chrome.storage.session
    .get(storageKey)
    .then((value) => {
      if (
        !connected &&
        revision === version &&
        validSession(value[storageKey])
      ) {
        connected = value[storageKey];
        scheduleClose();
      }
    })
    .catch(() => {});
}
async function restored() {
  await Promise.race([
    restoring,
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);
}
function scheduleClose() {
  clearTimeout(closeTimer);
  if (jobs || opening || !connected?.automatic || connected.needsVerification)
    return;
  closeTimer = setTimeout(() => void closeIdle(), 100);
}
async function closeIdle() {
  const session = connected;
  if (!session?.automatic || jobs || opening || session.needsVerification)
    return;
  const tab = await tabs.get(session.tabId).catch(() => null);
  if (connected !== session || jobs || opening || session.needsVerification)
    return;
  // If the user takes control of the tab, preserve it as a manual connection.
  if (tab?.active && ownedTab(tab, session)) {
    session.automatic = false;
    save();
    return;
  }
  const removable = ownedTab(tab, session);
  clear(session);
  if (removable) await tabs.remove(session.tabId).catch(() => {});
}
async function ensureSession(): Promise<Session> {
  clearTimeout(closeTimer);
  if (opening) return opening;
  if (!connected) await restored();
  if (connected) {
    const session = connected;
    const tab = await tabs.get(session.tabId).catch(() => null);
    if (connected === session && ownedTab(tab, session)) return session;
    clear(session);
  }
  if (opening) return opening;
  opening = (async () => {
    const tab = await tabs.create({ url: "about:blank", active: false });
    if (tab.id === undefined) throw new Error("Could not open Genius.");
    revision++;
    connected = { tabId: tab.id, automatic: true };
    blankTabId = tab.id;
    connectedReady = false;
    currentPage = undefined;
    save();
    return connected;
  })();
  try {
    return await opening;
  } finally {
    opening = undefined;
    scheduleClose();
  }
}
export async function connectGenius(youtubeTabId: number) {
  const session = await ensureSession();
  session.automatic = false;
  session.youtubeTabId = youtubeTabId;
  connectedReady = false;
  clearTimeout(closeTimer);
  save();
  const tab = await tabs.get(session.tabId);
  await tabs.update(session.tabId, {
    active: true,
    ...(tab.url === "about:blank" || blankTabId === session.tabId
      ? { url: "https://genius.com/" }
      : {}),
  });
  blankTabId = undefined;
  void chrome.tabs
    .sendMessage(
      session.tabId,
      { type: "GENIUS_SESSION_CHECK" },
      { frameId: 0 },
    )
    .catch(() => {});
}
export function forgetGeniusTab(tabId: number) {
  if (connected?.tabId !== tabId) return;
  clear(connected);
  if (requestedUrl)
    for (const listener of pageListeners)
      listener({ url: requestedUrl, verification: true });
}
function trusted(sender: chrome.runtime.MessageSender) {
  return (
    sender.id === chrome.runtime.id &&
    sender.frameId === 0 &&
    geniusOrigin(sender.url) &&
    (!sender.documentLifecycle || sender.documentLifecycle === "active")
  );
}
export async function geniusSessionReady(
  sender: chrome.runtime.MessageSender,
  message?: any,
) {
  if (!trusted(sender)) return;
  if (!connected) await restored();
  const session = connected;
  if (!session || session.tabId !== sender.tab?.id) return;
  let page: Page | undefined;
  if (
    message?.result !== undefined ||
    message?.type === "GENIUS_SESSION_BLOCKED" ||
    message?.type === "GENIUS_SESSION_FAILED"
  ) {
    let url: string;
    try {
      url = safeGeniusUrl(message.url);
    } catch {
      return;
    }
    if (url !== sender.url) return;
    if (message.type === "GENIUS_SESSION_BLOCKED") {
      session.needsVerification = true;
      page = { url, verification: true };
    } else if (message.type === "GENIUS_SESSION_FAILED") {
      if (typeof message.error !== "string" || message.error.length > 300)
        return;
      page = { url, error: message.error };
    } else {
      if (
        message.result?.status !== 200 ||
        typeof message.result.body !== "string" ||
        message.result.body.length > 2500000
      )
        return;
      page = { url, body: message.result.body };
    }
    currentPage = page;
    for (const listener of pageListeners) listener(page);
  }
  if (page?.verification) {
    save();
    return;
  }
  session.needsVerification = false;
  if (page?.error) return;
  save();
  if (connectedReady) return;
  connectedReady = true;
  // Active requests already receive the page directly; only a finished manual lookup needs retrying.
  if (!jobs && session.youtubeTabId !== undefined)
    void chrome.tabs
      .sendMessage(session.youtubeTabId, { type: "GENIUS_CONNECTED" })
      .catch(() => {});
}
/** Serial navigation prevents concurrent lookups from reading each other's pages. */
export function sessionGeniusRequest(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  clearTimeout(closeTimer);
  jobs++;
  const work = queue
    .catch(() => {})
    .then(() => request(url, signal))
    .finally(() => {
      jobs--;
      scheduleClose();
    });
  queue = work.catch(() => {});
  return signal ? abortable(work, signal) : work;
}
async function request(url: string, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  url = safeGeniusUrl(url);
  const target = new URL(url);
  const search =
    target.pathname === "/api/search" &&
    [...target.searchParams.keys()].every((k) => k === "q") &&
    !!target.searchParams.get("q") &&
    target.searchParams.get("q")!.length <= 300;
  if (!search && !/^\/[a-z\d%'-]+-lyrics$/i.test(target.pathname))
    throw new Error("Only Genius song and search requests are supported.");
  if (search)
    url =
      "https://genius.com/search?" +
      new URLSearchParams({ q: target.searchParams.get("q")! });
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 9000);
  const bounded = AbortSignal.any([
    ...(signal ? [signal] : []),
    deadline.signal,
  ]);
  let listener: (page: Page) => void = () => {};
  const available = new Promise<Page>((resolve) => {
    listener = (page) => {
      if (page.url === url) resolve(page);
    };
    pageListeners.add(listener);
  });
  requestedUrl = url;
  try {
    const session = await abortable(ensureSession(), bounded);
    bounded.throwIfAborted();
    // Do not loop requests at a real human-verification page.
    if (session.needsVerification) throw new Error(geniusVerification);
    const tab = await abortable(tabs.get(session.tabId), bounded);
    if (!ownedTab(tab, session)) {
      clear(session);
      throw new Error("Genius tab changed. Retry lyrics.");
    }
    if (tab.url !== url) {
      currentPage = undefined;
      await abortable(tabs.update(session.tabId, { url }), bounded);
      blankTabId = undefined;
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
    if (page.error) throw new Error(page.error);
    if (page.verification || page.body === undefined)
      throw new Error(geniusVerification);
    return new Response(page.body, { status: 200 });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (deadline.signal.aborted)
      throw new Error(
        "Genius took too long. Retry lyrics or choose Connect Genius.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    pageListeners.delete(listener);
    requestedUrl = undefined;
  }
}
