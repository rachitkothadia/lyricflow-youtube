import { safeGeniusUrl } from "./model";
import { abortable, extensionCall } from "./lyrics/requests";
const send = (message: any) =>
  extensionCall<any>((done) => chrome.runtime.sendMessage(message, done));
// Isolated reader: only text/title and public search JSON leave this document.
function needsVerification() {
  return (
    /make sure you.?re a human|verify you are human|just a moment|enable javascript and cookies|verification required/i.test(
      document.title + " " + document.body?.innerText.slice(0, 2000),
    ) || !!document.querySelector("#challenge-form,#cf-challenge-running")
  );
}
function readPage() {
  const url = new URL(safeGeniusUrl(location.href));
  if (url.pathname === "/api/search") {
    const body =
      document.querySelector("pre")?.textContent ||
      document.body?.innerText ||
      "";
    if (
      body.length > 2500000 ||
      !Array.isArray(JSON.parse(body)?.response?.hits)
    )
      return;
    return { status: 200, body };
  }
  if (!/^\/[a-z\d%'-]+-lyrics$/i.test(url.pathname)) return;
  const containers = [
    ...document.querySelectorAll('[data-lyrics-container="true"]'),
  ];
  if (!containers.length)
    containers.push(...document.querySelectorAll(".lyrics"));
  if (!containers.length) return;
  const output = document.createElement("div");
  const meta = document.createElement("meta");
  meta.setAttribute("property", "og:title");
  meta.content =
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')
      ?.content || document.title;
  output.append(meta);
  const text = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (
      !(node instanceof Element) ||
      [
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "BUTTON",
        "SVG",
        "RT",
        "INPUT",
        "TEXTAREA",
      ].includes(node.tagName) ||
      node.getAttribute("aria-hidden") === "true"
    )
      return "";
    if (node.tagName === "BR") return "\n";
    return (
      [...node.childNodes].map(text).join("") +
      (["P", "DIV"].includes(node.tagName) ? "\n" : "")
    );
  };
  for (const container of containers) {
    const copy = document.createElement("div");
    copy.setAttribute("data-lyrics-container", "true");
    copy.textContent = text(container);
    output.append(copy);
  }
  const body = output.innerHTML;
  if (body.length > 2500000) throw new Error("Genius response was too large.");
  return { status: 200, body };
}
let announced = false;
let blocked = false;
let poll: ReturnType<typeof setInterval> | undefined;
let retries = 0;
let searching = false;
let searchController: AbortController | undefined;
let searchGeneration = 0;
async function searchPage() {
  searching = true;
  const generation = ++searchGeneration;
  const controller = new AbortController();
  searchController = controller;
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const query = new URL(location.href).searchParams.get("q");
    if (!query || query.length > 300)
      throw new Error("Enter a song or artist.");
    const response = await abortable(
      fetch(
        "https://genius.com/api/search?" + new URLSearchParams({ q: query }),
        {
          credentials: "same-origin",
          redirect: "error",
          signal: controller.signal,
        },
      ),
      controller.signal,
    );
    if (generation !== searchGeneration) return;
    if (
      response.status === 403 ||
      response.headers.get("cf-mitigated") === "challenge"
    ) {
      blocked = true;
      await send({ type: "GENIUS_SESSION_BLOCKED", url: location.href });
      return;
    }
    if (!response.ok)
      throw new Error(`Genius returned ${response.status}. Retry lyrics.`);
    const body = await abortable(response.text(), controller.signal);
    if (
      body.length > 2500000 ||
      !Array.isArray(JSON.parse(body)?.response?.hits)
    )
      throw new Error("Genius returned an unreadable search response.");
    if (generation !== searchGeneration) return;
    announced = true;
    clearInterval(poll);
    await send({
      type: "GENIUS_SESSION_READY",
      url: location.href,
      result: { status: 200, body },
    });
  } catch (error) {
    if (generation === searchGeneration)
      void send({
        type: "GENIUS_SESSION_FAILED",
        url: location.href,
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Genius search could not load. Retry lyrics.",
      }).catch(() => {});
  } finally {
    clearTimeout(timer);
  }
}
function ready() {
  if (!document.body) return;
  if (needsVerification()) {
    if (!blocked)
      void send({ type: "GENIUS_SESSION_BLOCKED", url: location.href }).catch(
        () => {
          blocked = false;
        },
      );
    blocked = true;
    return;
  }
  blocked = false;
  if (announced) return;
  if (location.pathname === "/search") {
    if (!searching) void searchPage();
    return;
  }
  let result;
  try {
    result = readPage();
  } catch {
    return;
  }
  if (!result && document.body.innerText.length < 200) return;
  // Song pages can hydrate their lyric containers after document_idle.
  if (/lyrics\/?$/i.test(location.pathname) && !result) return;
  announced = true;
  clearInterval(poll);
  void send({ type: "GENIUS_SESSION_READY", url: location.href, result }).catch(
    () => {
      announced = false;
      if (retries++ < 3) setTimeout(ready, 200);
    },
  );
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    message?.type !== "GENIUS_SESSION_CHECK"
  )
    return false;
  announced = false;
  searching = false;
  searchGeneration++;
  searchController?.abort();
  ready();
  reply({ ok: true });
  return false;
});
const observer = new MutationObserver(ready);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});
poll = setInterval(ready, 250);
ready();
setTimeout(() => clearInterval(poll), 10000);
setTimeout(() => observer.disconnect(), 5 * 60 * 1000);
