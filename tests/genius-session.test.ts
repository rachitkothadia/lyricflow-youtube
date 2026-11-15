import test from "node:test";
import { GeniusWebProvider } from "../src/lyrics/GeniusWebProvider";
import { resolveLyrics } from "../src/lyrics/resolveLyrics";
import assert from "node:assert/strict";
import {
  connectGenius,
  forgetGeniusTab,
  geniusSessionReady,
  restoreGeniusSession,
  sessionGeniusRequest,
} from "../src/lyrics/GeniusSession";
const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const song = "https://genius.com/Northlight-paper-sun-lyrics";
async function browser(run: (s: any) => Promise<void>) {
  const previous = Reflect.get(globalThis, "chrome");
  const s: any = {
    next: 100,
    stored: undefined,
    created: [],
    removed: [],
    sent: [],
    blocked: false,
    publish: true,
    delay: 0,
    tabs: new Map([
      [
        22,
        {
          id: 22,
          url: "https://www.youtube.com/watch?v=fixture0001",
          active: true,
        },
      ],
      [
        77,
        { id: 77, url: "https://genius.com/User-opened-lyrics", active: false },
      ],
    ]),
  };
  s.sender = (id: number, url = s.tabs.get(id)?.url) => ({
    id: "fixture",
    frameId: 0,
    documentLifecycle: "active",
    documentId: "document",
    url,
    tab: { id },
  });
  s.body = (url: string) =>
    `<div data-lyrics-container="true">Synthetic: ${url}</div>`;
  s.announce = async (id: number) => {
    const url = s.tabs.get(id)?.url;
    if (!url || url === "about:blank") return;
    await geniusSessionReady(
      s.sender(id),
      s.blocked
        ? { type: "GENIUS_SESSION_BLOCKED", url }
        : {
            type: "GENIUS_SESSION_READY",
            url,
            result: { status: 200, body: s.body(url) },
          },
    );
  };
  Reflect.set(globalThis, "chrome", {
    runtime: { id: "fixture" },
    storage: {
      session: {
        get: async () => ({ geniusSession: s.stored }),
        set: async (v: any) => {
          s.stored = { ...v.geniusSession };
        },
        remove: async () => {
          s.stored = undefined;
        },
      },
    },
    tabs: {
      get: async (id: number) => {
        if (!s.tabs.has(id)) throw new Error("closed");
        const tab = s.tabs.get(id);
        return tab.url === "about:blank" ? { ...tab, url: undefined } : tab;
      },
      create: async (v: any) => {
        const id = s.next++;
        s.created.push({ id, ...v });
        s.tabs.set(id, { id, ...v });
        return { id };
      },
      update: async (id: number, v: any) => {
        s.tabs.set(id, { ...s.tabs.get(id), ...v });
        if (v.url && s.publish) setTimeout(() => void s.announce(id), s.delay);
        return s.tabs.get(id);
      },
      remove: async (id: number) => {
        s.removed.push(id);
        s.tabs.delete(id);
        forgetGeniusTab(id);
      },
      sendMessage: async (id: number, message: any) => {
        s.sent.push({ id, message });
        if (message.type === "GENIUS_SESSION_CHECK" && s.publish)
          queueMicrotask(() => void s.announce(id));
        return { ok: true };
      },
    },
  });
  restoreGeniusSession();
  await wait(0);
  try {
    await run(s);
  } finally {
    for (const id of s.tabs.keys()) forgetGeniusTab(id);
    await wait();
    if (previous === undefined) Reflect.deleteProperty(globalThis, "chrome");
    else Reflect.set(globalThis, "chrome", previous);
  }
}
test("Genius automatically opens one inactive owned tab, reuses it and closes after results", () =>
  browser(async (s) => {
    for (const url of [
      "https://evil.test/",
      "https://genius.com/account",
      "https://genius.com/api/search?q=x&extra=y",
    ])
      await assert.rejects(sessionGeniusRequest(url));
    assert.equal(s.created.length, 0);
    const query = "https://genius.com/api/search?q=paper+sun";
    assert.equal(
      await (await sessionGeniusRequest(query)).text(),
      s.body(query.replace("/api/search", "/search")),
    );
    assert.equal(await (await sessionGeniusRequest(song)).text(), s.body(song));
    assert.equal(s.created.length, 1);
    assert.deepEqual(s.created[0], {
      id: 100,
      url: "about:blank",
      active: false,
    });
    assert.equal(
      s.sent.some((v: any) => v.message.type === "GENIUS_CONNECTED"),
      false,
      "Automatic readiness must not restart an active lookup",
    );
    await wait();
    assert.deepEqual(s.removed, [100]);
    assert.equal(s.stored, undefined);
    assert.equal(s.tabs.has(77), true, "A user-opened Genius tab must survive");
    await sessionGeniusRequest(song);
    await wait();
    assert.deepEqual(s.removed, [100, 101]);
  }));
test("concurrent Genius lookups serialize navigation and keep separate page bodies", () =>
  browser(async (s) => {
    s.delay = 20;
    const other = "https://genius.com/Daybreak-paper-moon-lyrics";
    const responses = await Promise.all([
      sessionGeniusRequest(song),
      sessionGeniusRequest(other),
    ]);
    assert.deepEqual(await Promise.all(responses.map((r) => r.text())), [
      s.body(song),
      s.body(other),
    ]);
    assert.equal(s.created.length, 1);
    await wait();
    assert.deepEqual(s.removed, [100]);
  }));
test("cancelled and queued Genius work cleans up temporary tabs without navigation from cancelled jobs", () =>
  browser(async (s) => {
    const already = new AbortController();
    already.abort();
    await assert.rejects(sessionGeniusRequest(song, already.signal), {
      name: "AbortError",
    });
    await wait(0);
    assert.equal(s.created.length, 0);
    s.publish = false;
    const first = new AbortController(),
      second = new AbortController();
    const pending = sessionGeniusRequest(song, first.signal);
    const queued = sessionGeniusRequest(
      "https://genius.com/Other-song-lyrics",
      second.signal,
    );
    second.abort();
    await assert.rejects(queued, { name: "AbortError" });
    await wait(15);
    first.abort();
    await assert.rejects(pending, { name: "AbortError" });
    await wait();
    assert.equal(s.created.length, 1);
    assert.deepEqual(s.removed, [100]);
  }));
test("real verification stays open, requires explicit interaction and retries after a valid manual check", () =>
  browser(async (s) => {
    s.blocked = true;
    await assert.rejects(sessionGeniusRequest(song), /Connect Genius/);
    await wait();
    assert.deepEqual(s.removed, []);
    assert.equal(s.tabs.get(100).active, false);
    assert.equal(s.stored.needsVerification, true);
    const count = s.created.length;
    await assert.rejects(
      sessionGeniusRequest("https://genius.com/Other-song-lyrics"),
      /Connect Genius/,
    );
    assert.equal(
      s.created.length,
      count,
      "Do not loop background tabs at a human check",
    );
    await connectGenius(22);
    assert.equal(s.tabs.get(100).active, true);
    s.blocked = false;
    await s.announce(100);
    assert.ok(
      s.sent.some(
        (v: any) => v.id === 22 && v.message.type === "GENIUS_CONNECTED",
      ),
    );
    assert.equal(await (await sessionGeniusRequest(song)).text(), s.body(song));
    await wait();
    assert.deepEqual(
      s.removed,
      [],
      "Preserve a tab taken over for manual verification",
    );
  }));
test("Genius rejects foreign senders, stale documents and invalid data without replacing a verified page", () =>
  browser(async (s) => {
    await connectGenius(22);
    await wait(10);
    const id = s.created[0].id;
    await sessionGeniusRequest(song);
    const sender = s.sender(id);
    for (const change of [
      { id: "foreign" },
      { frameId: 1 },
      { documentLifecycle: "cached" },
      { url: "https://evil.test/" },
      { tab: { id: 77 } },
    ])
      await geniusSessionReady(
        { ...sender, ...change },
        { url: song, result: { status: 200, body: "bad" } },
      );
    for (const result of [
      { status: 403, body: "bad" },
      { status: 200, body: 7 },
      { status: 200, body: "x".repeat(2500001) },
    ])
      await geniusSessionReady(sender, { url: song, result });
    await geniusSessionReady(sender, {
      url: "https://genius.com/Other-song-lyrics",
      result: { status: 200, body: "stale" },
    });
    assert.equal(await (await sessionGeniusRequest(song)).text(), s.body(song));
  }));
test("cleanup preserves foreign navigations and tabs the user activates", () =>
  browser(async (s) => {
    await sessionGeniusRequest(song);
    s.tabs.get(100).url = "https://example.com/";
    await wait();
    assert.equal(s.tabs.has(100), true);
    assert.deepEqual(s.removed, []);
    await sessionGeniusRequest(song);
    s.tabs.get(101).active = true;
    await wait();
    assert.equal(s.tabs.has(101), true);
    assert.equal(s.stored.automatic, false);
  }));
test("closed Genius tabs reject pending work and the next lookup recovers automatically", () =>
  browser(async (s) => {
    s.publish = false;
    const pending = sessionGeniusRequest(song);
    await wait(15);
    s.tabs.delete(100);
    forgetGeniusTab(100);
    await assert.rejects(pending, /Connect Genius/);
    s.publish = true;
    await sessionGeniusRequest(song);
    await wait();
    assert.equal(s.created.length, 2);
    assert.deepEqual(s.removed, [101]);
  }));

test("Genius deadline closes a temporary tab when no readable page arrives", () =>
  browser(async (s) => {
    s.publish = false;
    await assert.rejects(sessionGeniusRequest(song), /Genius took too long/);
    await wait();
    assert.deepEqual(s.removed, [100]);
    assert.equal(s.stored, undefined);
  }));

test("worker restoration cleans an orphaned automatic tab and preserves manual connections", () =>
  browser(async (s) => {
    s.tabs.set(88, { id: 88, url: song, active: false });
    s.stored = { tabId: 88, automatic: true };
    restoreGeniusSession();
    await wait();
    assert.deepEqual(s.removed, [88]);
    s.stored = { tabId: 77, youtubeTabId: 22 };
    restoreGeniusSession();
    await wait(0);
    await sessionGeniusRequest(song);
    await wait();
    assert.deepEqual(s.removed, [88]);
    assert.equal(
      s.created.length,
      0,
      "A saved manual connection should remain usable",
    );
  }));

test("automatic provider resolution retrieves Genius search and lyric pages without manual connection", () =>
  browser(async (s) => {
    const html =
      '<div data-lyrics-container="true">Synthetic first line<br>Synthetic second line</div>';
    s.body = (url: string) =>
      new URL(url).pathname === "/search"
        ? JSON.stringify({
            response: {
              hits: [
                {
                  result: {
                    id: 99008,
                    title: "Paper Sun",
                    primary_artist: { name: "Northlight" },
                    url: song,
                  },
                },
              ],
            },
          })
        : html;
    const result = await resolveLyrics(
      { title: "Paper Sun", artist: "Northlight", version: "" },
      {
        resolve: async () => ({ kind: "no-results", message: "Fixture miss" }),
      } as any,
      new GeniusWebProvider(),
      new AbortController().signal,
      0,
    );
    assert.equal(result.kind, "genius-page");
    if (result.kind === "genius-page") assert.equal(result.html, html);
    assert.equal(s.created.length, 1);
    assert.equal(s.created[0].active, false);
    await wait();
    assert.deepEqual(s.removed, [100]);
  }));
