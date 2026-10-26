import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseRecord,
  LrclibProvider,
  LrclibRecord,
} from "../src/lyrics/LrclibProvider";
const song = {
  artist: "Northlight",
  title: "Paper Sun",
  version: "",
  duration: 180,
};
const plain: LrclibRecord = {
  id: 920001,
  artistName: song.artist,
  trackName: song.title,
  albumName: "Test album",
  duration: 180,
  instrumental: false,
  plainLyrics: "Synthetic first line\nSynthetic second line",
  syncedLyrics: null,
};
const timed: LrclibRecord = {
  ...plain,
  id: 920002,
  duration: 174,
  syncedLyrics:
    "[00:02.50]Synthetic first line\n[00:08.00]Synthetic second line",
};
const json = (data: unknown) => new Response(JSON.stringify(data));
test("a safely matched timed edition takes priority over a higher-scoring plain edition", () => {
  assert.equal(chooseRecord(song, [plain, timed])?.id, timed.id);
});
test("sync preference never overrides artist, version or duration evidence", () => {
  for (const change of [
    { artistName: "Other artist" },
    { albumName: "Live remix" },
    { duration: 240 },
  ])
    assert.equal(
      chooseRecord(song, [plain, { ...timed, ...change }])?.id,
      plain.id,
    );
});
test("plain records never gain invented timestamps", async () => {
  const result = await new LrclibProvider(async () => json([plain])).resolve(
    song,
    new AbortController().signal,
  );
  assert.equal(result.kind, "ready");
  if (result.kind === "ready")
    assert.ok(result.lyrics.lines.every((l) => l.time === undefined));
});
test("normalized fallback discovers timing even when exact search returned readable plain lyrics", async () => {
  const calls: string[] = [];
  const provider = new LrclibProvider(async (url) => {
    calls.push(String(url));
    return json(calls.length === 1 ? [plain] : [timed]);
  });
  const result = await provider.resolve(song, new AbortController().signal);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.get("q"), "Northlight Paper Sun");
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.deepEqual(
      result.lyrics.lines.map((l) => l.time),
      [2.5, 8],
    );
    assert.equal(result.lyrics.sourceUrl, "https://lrclib.net/api/get/920002");
  }
});
test("unrelated early results do not suppress a correctly credited timed result", async () => {
  let calls = 0;
  const provider = new LrclibProvider(async () =>
    json(++calls === 1 ? [{ ...timed, artistName: "Other artist" }] : [timed]),
  );
  const result = await provider.resolve(song, new AbortController().signal);
  assert.equal(result.kind, "ready");
  if (result.kind === "ready")
    assert.equal(result.lyrics.song.artist, song.artist);
  assert.equal(calls, 2);
});
test("failure of an optional timing search preserves existing readable lyrics", async () => {
  let calls = 0;
  const provider = new LrclibProvider(async () =>
    ++calls === 1 ? json([plain]) : new Response("", { status: 500 }),
  );
  const result = await provider.resolve(song, new AbortController().signal);
  assert.equal(result.kind, "ready");
  if (result.kind === "ready")
    assert.ok(result.lyrics.lines.every((l) => l.time === undefined));
});
