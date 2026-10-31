import test from "node:test";
import assert from "node:assert/strict";
import { resolveLyrics } from "../src/lyrics/resolveLyrics";
import { RequestScheduler } from "../src/lyrics/requests";
import { LrclibProvider } from "../src/lyrics/LrclibProvider";
import { GeniusWebProvider } from "../src/lyrics/GeniusWebProvider";
import type { Lyrics } from "../src/model";
const song = {
  title: "Paper Sun",
  artist: "Northlight",
  version: "",
  duration: 180,
};
const lyrics: Lyrics = {
  song,
  lines: [{ text: "Synthetic words", time: 1 }],
  sourceUrl: "https://lrclib.net/api/get/99100",
  provenance: "lrclib",
  romanized: true,
};
const page = {
  kind: "genius-page" as const,
  song,
  html: "Synthetic fixture",
  url: "https://genius.com/Northlight-paper-sun-lyrics",
};
const never = () => new Promise<never>(() => {});
const signal = () => new AbortController().signal;

test("slow primary lookup cannot delay a strict Genius match", async () => {
  let primarySignal: AbortSignal | undefined;
  const start = Date.now();
  const result = await resolveLyrics(
    song,
    {
      resolve: async (_, s) => {
        primarySignal = s;
        return never();
      },
    },
    { resolve: async () => page },
    signal(),
    10,
  );
  assert.equal(result.kind, "genius-page");
  assert.ok(Date.now() - start < 200);
  assert.ok(primarySignal?.aborted);
});
test("fast primary match avoids any Genius request", async () => {
  let calls = 0;
  const result = await resolveLyrics(
    song,
    { resolve: async () => ({ kind: "ready", lyrics }) },
    {
      resolve: async () => {
        calls++;
        return page;
      },
    },
    signal(),
    10,
  );
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(result.kind, "ready");
  assert.equal(calls, 0);
});
test("a primary miss starts fallback immediately instead of waiting for hedge", async () => {
  const result = await resolveLyrics(
    song,
    { resolve: async () => ({ kind: "not-found", message: "No match" }) },
    { resolve: async () => page },
    signal(),
    10000,
  );
  assert.equal(result.kind, "genius-page");
});
test("ambiguous candidates are never converted into an automatic match", async () => {
  const result = await resolveLyrics(
    song,
    { resolve: async () => ({ kind: "ambiguous", candidates: [] }) },
    { resolve: async () => null },
    signal(),
    10,
  );
  assert.equal(result.kind, "ambiguous");
});
test("fallback failure preserves existing candidates but not a false catalogue miss", async () => {
  const broken = {
    resolve: async () => {
      throw new Error("Source unavailable");
    },
  };
  assert.equal(
    (
      await resolveLyrics(
        song,
        { resolve: async () => ({ kind: "ambiguous", candidates: [] }) },
        broken,
        signal(),
      )
    ).kind,
    "ambiguous",
  );
  await assert.rejects(
    resolveLyrics(
      song,
      { resolve: async () => ({ kind: "not-found", message: "No match" }) },
      broken,
      signal(),
    ),
    /Source unavailable/,
  );
});
test("navigation cancels a hung lookup and its delayed fallback", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = resolveLyrics(
    song,
    { resolve: never },
    {
      resolve: async () => {
        calls++;
        return page;
      },
    },
    controller.signal,
    10,
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls, 0);
});
test("scheduler allows new work past a slow transfer with bounded concurrency", async () => {
  const scheduler = new RequestScheduler(5);
  const controller = new AbortController();
  let active = 0,
    maximum = 0;
  const slow = scheduler.run(async () => {
    active++;
    maximum = Math.max(maximum, active);
    return never();
  }, controller.signal);
  const fast = await scheduler.run(async () => {
    active++;
    maximum = Math.max(maximum, active);
    active--;
    return "next song";
  }, signal());
  assert.equal(fast, "next song");
  assert.equal(maximum, 2);
  controller.abort();
  await assert.rejects(slow, { name: "AbortError" });
});
test("cancelled queued work never reaches a transport", async () => {
  const scheduler = new RequestScheduler(30);
  await scheduler.run(async () => 1, signal());
  const controller = new AbortController();
  let calls = 0;
  const queued = scheduler.run(async () => {
    calls++;
    return 2;
  }, controller.signal);
  controller.abort();
  await assert.rejects(queued, { name: "AbortError" });
  assert.equal(await scheduler.run(async () => 3, signal()), 3);
  assert.equal(calls, 0);
});
test("fast readable lyrics reuse positive search cache without inventing timing", async () => {
  let calls = 0;
  const provider = new LrclibProvider(async () => {
    calls++;
    return new Response(
      JSON.stringify([
        {
          id: 99104,
          trackName: song.title,
          artistName: song.artist,
          albumName: "Synthetic",
          duration: 180,
          plainLyrics: "Synthetic words",
          syncedLyrics: null,
        },
      ]),
    );
  });
  for (let i = 0; i < 2; i++) {
    const found = await provider.resolve(song, signal(), true);
    assert.equal(found.kind, "ready");
    if (found.kind === "ready")
      assert.equal(found.lyrics.lines[0].time, undefined);
  }
  assert.equal(calls, 1);
});
test("Genius positive query cache saves requests and still distinguishes queries", async () => {
  let calls = 0;
  const provider = new GeniusWebProvider(async () => {
    calls++;
    return new Response(
      JSON.stringify({
        response: {
          hits: [
            {
              result: {
                id: 99105,
                title: song.title,
                primary_artist: { name: song.artist },
                url: page.url,
              },
            },
          ],
        },
      }),
    );
  });
  await provider.search("Paper Sun", signal());
  await provider.search(" paper sun ", signal());
  assert.equal(calls, 1);
  await provider.search("Other words", signal());
  assert.equal(calls, 2);
});
test("cached search results still enforce recording duration before automatic choice", async () => {
  const provider = new LrclibProvider(
    async () =>
      new Response(
        JSON.stringify([
          {
            id: 99106,
            trackName: song.title,
            artistName: song.artist,
            albumName: "Synthetic",
            duration: 180,
            plainLyrics: "Synthetic words",
            syncedLyrics: null,
          },
        ]),
      ),
  );
  assert.equal((await provider.resolve(song, signal(), true)).kind, "ready");
  assert.equal(
    (await provider.resolve({ ...song, duration: 300 }, signal(), true)).kind,
    "ambiguous",
  );
});
test("malformed empty search results are not cached across retries", async () => {
  let calls = 0;
  const provider = new LrclibProvider(
    async () =>
      new Response(
        JSON.stringify(
          ++calls <= 2
            ? [{ invalid: true }]
            : [
                {
                  id: 99107,
                  trackName: song.title,
                  artistName: song.artist,
                  albumName: "Synthetic",
                  duration: 180,
                  plainLyrics: "Synthetic words",
                  syncedLyrics: null,
                },
              ],
        ),
      ),
  );
  assert.equal((await provider.search(song, signal(), true)).length, 0);
  assert.equal((await provider.search(song, signal(), true)).length, 1);
  assert.equal(calls, 3);
});
