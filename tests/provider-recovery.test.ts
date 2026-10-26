import test from "node:test";
import assert from "node:assert/strict";
import { LrclibProvider } from "../src/lyrics/LrclibProvider";
import { GeniusWebProvider } from "../src/lyrics/GeniusWebProvider";
import { safeGeniusUrl } from "../src/model";
test("shared Genius links normalize www, tracking, fragments and trailing slash", () => {
  assert.equal(
    safeGeniusUrl(
      " https://www.genius.com/Northlight-paper-sun-lyrics/?utm_source=share#verse ",
    ),
    "https://genius.com/Northlight-paper-sun-lyrics",
  );
  assert.equal(
    safeGeniusUrl("https://genius.com/api/search?q=test"),
    "https://genius.com/api/search?q=test",
  );
  for (const url of [
    "https://genius.com.evil.test/song-lyrics",
    "http://genius.com/song-lyrics",
    "https://user@genius.com/song-lyrics",
  ])
    assert.throws(() => safeGeniusUrl(url));
});
test("optional Genius search failure preserves already discovered choices", async () => {
  let count = 0;
  const provider = new GeniusWebProvider(async () =>
    ++count === 1
      ? new Response(
          JSON.stringify({
            response: {
              hits: [1, 2].map((id) => ({
                result: {
                  id,
                  title: "Paper Sun",
                  primary_artist: { name: "Northlight" },
                  url: "https://genius.com/Northlight-paper-sun-lyrics",
                },
              })),
            },
          }),
        )
      : new Response("", { status: 503 }),
  );
  const result = await provider.resolve(
    { title: "Paper Sun", artist: "Northlight", version: "" },
    new AbortController().signal,
  );
  assert.equal(result?.kind, "ambiguous");
  if (result?.kind === "ambiguous") assert.equal(result.candidates.length, 2);
});
test("an overloaded LRCLIB query does not impose an undocumented cooldown on other songs", async () => {
  const unavailable = new LrclibProvider(
    async () => new Response("", { status: 503 }),
  );
  await assert.rejects(
    unavailable.resolve(
      { title: "Missing", artist: "Northlight", version: "" },
      new AbortController().signal,
    ),
  );
  let requests = 0;
  const available = new LrclibProvider(async () => {
    requests++;
    return new Response(
      JSON.stringify([
        {
          id: 930001,
          trackName: "Paper Sun",
          artistName: "Northlight",
          albumName: "Studio",
          duration: 180,
          plainLyrics: "Synthetic lyric",
          syncedLyrics: "[00:01.00]Synthetic lyric",
        },
      ]),
    );
  });
  const result = await available.resolve(
    { title: "Paper Sun", artist: "Northlight", version: "", duration: 180 },
    new AbortController().signal,
  );
  assert.equal(result.kind, "ready");
  assert.equal(requests, 1);
});

test("irrelevant results do not hide a later provider failure as a catalogue miss", async () => {
  let count = 0;
  const provider = new GeniusWebProvider(async () =>
    ++count === 1
      ? new Response(
          JSON.stringify({
            response: {
              hits: [
                {
                  result: {
                    id: 3,
                    title: "Other Moon",
                    primary_artist: { name: "Other artist" },
                    url: "https://genius.com/Other-artist-other-moon-lyrics",
                  },
                },
              ],
            },
          }),
        )
      : new Response("", { status: 503 }),
  );
  await assert.rejects(
    provider.resolve(
      { title: "Paper Sun", artist: "Northlight", version: "" },
      new AbortController().signal,
    ),
    /503/,
  );
});
