import test from "node:test";
import assert from "node:assert/strict";
import { GeniusWebProvider } from "../src/lyrics/GeniusWebProvider";
const song = { title: "Underpressure", artist: "Karma", version: "" };
const hit = (id: number, title = "Underpressure", artist = "Karma") => ({
  result: {
    id,
    title,
    primary_artist: { name: artist },
    url: `https://genius.com/${artist.toLowerCase()}-${title.toLowerCase()}-lyrics`,
  },
});
test("Genius exact public match retrieves only the canonical lyrics page", async () => {
  const urls: string[] = [];
  const provider = new GeniusWebProvider(async (input) => {
    urls.push(String(input));
    return new Response(
      urls.length === 1
        ? JSON.stringify({ response: { hits: [hit(1)] } })
        : '<div data-lyrics-container="true">Original test line</div>',
    );
  });
  const result = await provider.resolve(song, new AbortController().signal);
  assert.equal(result?.kind, "genius-page");
  assert.equal(urls.length, 2);
  assert.equal(urls[1], "https://genius.com/karma-underpressure-lyrics");
});
test("Genius close alternatives require selection and empty search remains empty", async () => {
  const p = new GeniusWebProvider(
    async () =>
      new Response(JSON.stringify({ response: { hits: [hit(1), hit(2)] } })),
  );
  assert.equal(
    (await p.resolve(song, new AbortController().signal))?.kind,
    "ambiguous",
  );
  const empty = new GeniusWebProvider(
    async () => new Response(JSON.stringify({ response: { hits: [] } })),
  );
  assert.equal(await empty.resolve(song, new AbortController().signal), null);
});
test("Genius reader rejects foreign URLs, non-song paths, blocked pages and oversized bodies", async () => {
  const signal = new AbortController().signal;
  let calls = 0;
  const p = new GeniusWebProvider(async () => {
    calls++;
    return new Response("<html>No lyrics</html>");
  });
  await assert.rejects(
    p.page("https://evil.test/karma-underpressure-lyrics", song, signal),
  );
  await assert.rejects(p.page("https://genius.com/api/search", song, signal));
  assert.equal(calls, 0);
  await assert.rejects(
    p.page("https://genius.com/karma-underpressure-lyrics", song, signal),
    /readable/,
  );
  await assert.rejects(
    new GeniusWebProvider(
      async () => new Response("", { status: 403 }),
    ).resolve(song, signal),
    /declined/,
  );
  await assert.rejects(
    new GeniusWebProvider(
      async () => new Response("x".repeat(2500001)),
    ).resolve(song, signal),
    /too large/,
  );
});
