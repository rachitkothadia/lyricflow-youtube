import test from "node:test";
import assert from "node:assert/strict";
import {
  connectGenius,
  geniusSessionReady,
  sessionGeniusRequest,
} from "../src/lyrics/GeniusSession";
import { GeniusWebProvider } from "../src/lyrics/GeniusWebProvider";

test("Genius session ownership, response bounds and cancellation", async () => {
  const previous = Reflect.get(globalThis, "chrome");
  let session: any,
    tab: any = { id: 11, url: "https://genius.com/" },
    created = 0,
    publish = true;
  const sent: any[] = [],
    updates: any[] = [];
  const sender = (url = tab.url): chrome.runtime.MessageSender => ({
    id: "fixture",
    frameId: 0,
    documentId: "document",
    url,
    tab: { id: 11 } as chrome.tabs.Tab,
  });
  const announce = () =>
    geniusSessionReady(sender(), {
      url: tab.url,
      result: { status: 200, body: "synthetic" },
    });
  Reflect.set(globalThis, "chrome", {
    runtime: { id: "fixture" },
    storage: {
      session: {
        get: async () => ({ geniusSession: session }),
        set: async (v: any) => {
          session = v.geniusSession;
        },
        remove: async () => {
          session = undefined;
        },
      },
    },
    tabs: {
      get: async () => tab,
      create: async () => {
        created++;
        return { id: 11 };
      },
      update: async (id: number, v: any) => {
        updates.push({ id, ...v });
        if (v.url) tab = { id, url: v.url };
        if (publish && v.url?.endsWith("-lyrics"))
          queueMicrotask(() => void announce());
      },
      sendMessage: async (id: number, message: any) => {
        sent.push({ id, message });
        return { ok: true };
      },
    },
  });
  const url = "https://genius.com/Test-song-lyrics";
  try {
    assert.equal(await sessionGeniusRequest(url), null);
    await connectGenius(22);
    assert.equal(created, 1);
    assert.deepEqual(session, { tabId: 11, youtubeTabId: 22 });
    assert.equal(updates[0].url, "https://genius.com/");
    await connectGenius(23);
    assert.equal(created, 1);
    assert.equal(session.youtubeTabId, 23);
    sent.length = 0;
    for (const change of [
      { id: "foreign" },
      { frameId: 1 },
      { url: "https://evil.test/" },
      { tab: { id: 55 } },
    ])
      await geniusSessionReady({
        ...sender(),
        ...change,
      } as chrome.runtime.MessageSender);
    assert.equal(sent.length, 0);
    await geniusSessionReady(sender());
    assert.deepEqual(sent[0], {
      id: 23,
      message: { type: "GENIUS_CONNECTED" },
    });
    assert.equal(await (await sessionGeniusRequest(url))!.text(), "synthetic");
    // Invalid source records cannot replace the current, validated page.
    for (const message of [
      { url: "https://evil.test/", result: { status: 200, body: "bad" } },
      { url, result: { status: 403, body: "bad" } },
      { url, result: { status: 200, body: "x".repeat(2500001) } },
      { url, result: { status: 200, body: 7 } },
    ])
      await geniusSessionReady(sender(), message);
    assert.equal(await (await sessionGeniusRequest(url))!.text(), "synthetic");
    for (const invalid of [
      "https://evil.test/",
      "https://genius.com/account",
      "https://genius.com/api/search?q=x&secret=y",
    ])
      await assert.rejects(sessionGeniusRequest(invalid));
    publish = false;
    const controller = new AbortController();
    const pending = sessionGeniusRequest(
      "https://genius.com/Another-song-lyrics",
      controller.signal,
    );
    await new Promise((r) => setTimeout(r, 10));
    // A late record for the previous page cannot satisfy the new lookup.
    await geniusSessionReady(sender(url), {
      url,
      result: { status: 200, body: "stale" },
    });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    tab = { id: 11, url: "https://evil.test/" };
    assert.equal(await sessionGeniusRequest(url), null);
    assert.equal(session, undefined);
    Reflect.get(globalThis, "chrome").runtime.sendNativeMessage = async () => ({
      status: 403,
      body: "Verification required",
    });
    await assert.rejects(
      new GeniusWebProvider().search("paper sun", new AbortController().signal),
      /Connect Genius/,
    );
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "chrome");
    else Reflect.set(globalThis, "chrome", previous);
  }
});
