import { safeGeniusUrl } from "./model";
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
function ready() {
  if (announced || needsVerification() || !document.body) return;
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
  void chrome.runtime
    .sendMessage({ type: "GENIUS_SESSION_READY", url: location.href, result })
    .catch(() => {
      announced = false;
    });
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    message?.type !== "GENIUS_SESSION_CHECK"
  )
    return false;
  announced = false;
  ready();
  reply({ ok: true });
  return false;
});
const observer = new MutationObserver(ready);
observer.observe(document.documentElement, { childList: true, subtree: true });
ready();
setTimeout(() => observer.disconnect(), 5 * 60 * 1000);
