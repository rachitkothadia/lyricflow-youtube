import test from "node:test";
import assert from "node:assert/strict";
import {
  recordIdentity,
  chooseRecord,
  LrclibRecord,
} from "../src/lyrics/LrclibProvider";
import {
  calibrationOffset,
  timingKey,
  validCorrection,
} from "../src/timing/preferences";
import {
  parseCaptionJson,
  captionsMatch,
  alignCaptionTiming,
} from "../src/timing/YouTubeCaptions";
import { Lyrics } from "../src/model";
const plain: LrclibRecord = {
  id: 990001,
  artistName: "Northlight",
  trackName: "Paper Sun",
  albumName: "Album",
  duration: 240,
  instrumental: false,
  plainLyrics: "First synthetic line\nSecond synthetic line",
  syncedLyrics: null,
};
const timed = {
  ...plain,
  id: 990002,
  syncedLyrics:
    "[00:08.00]First synthetic line\n[00:12.00]Second synthetic line",
};
const song = {
  artist: "Northlight",
  title: "Paper Sun",
  version: "",
  duration: 240,
};
test("feature credit inside a track title preserves title and artist evidence", () => {
  const record = { ...timed, trackName: "Paper Sun (feat. Daybreak)" };
  assert.equal(recordIdentity(record).title, "Paper Sun");
  assert.deepEqual(recordIdentity(record).artists, ["Northlight", "Daybreak"]);
  assert.equal(
    chooseRecord(
      {
        ...song,
        artist: "Northlight & Daybreak",
        artists: ["Northlight", "Daybreak"],
      },
      [record],
    )?.id,
    record.id,
  );
});
test("player status suffixes normalize without stripping real song names or versions", () => {
  for (const suffix of ["Paused", "Playing"])
    assert.equal(
      recordIdentity({ ...timed, trackName: `Paper Sun (${suffix})` }).title,
      "Paper Sun",
    );
  assert.equal(
    recordIdentity({ ...timed, trackName: "Paused" }).title,
    "Paused",
  );
  assert.equal(
    recordIdentity({ ...timed, trackName: "Paper Sun (Live)" }).version,
    "live",
  );
});
test("different recording timing never silently overrides the matching plain edition", () => {
  assert.equal(
    chooseRecord(song, [plain, { ...timed, duration: 225 }])?.id,
    plain.id,
  );
  assert.equal(chooseRecord(song, [{ ...timed, duration: 225 }]), null);
});
test("line calibration supports long intros and fine delay remains bounded", () => {
  assert.equal(calibrationOffset(28.03, 8), 20);
  assert.equal(calibrationOffset(8, 28), -20);
  assert.equal(validCorrection({ base: 59, fine: 0.3 }), true);
  for (const value of [
    { base: NaN, fine: 0 },
    { base: 0, fine: 10.1 },
    { base: 0, fine: 0.11 },
  ])
    assert.equal(validCorrection(value), false);
  assert.throws(() => calibrationOffset(NaN, 8));
});
const lyrics: Lyrics = {
  song,
  lines: [{ text: "First synthetic line", time: 8 }],
  sourceUrl: "https://lrclib.net/api/get/990002",
  provenance: "lrclib",
  romanized: true,
};
test("saved timing is scoped to exact video, source, recording length and timestamp data", () => {
  const key = timingKey("timings001a", lyrics, 240);
  assert.match(key, /^[\w-]{11}:[a-f0-9]{16}$/);
  for (const other of [
    timingKey("timings002b", lyrics, 240),
    timingKey("timings001a", lyrics, 285),
    timingKey(
      "timings001a",
      { ...lyrics, lines: [{ text: "First synthetic line", time: 9 }] },
      240,
    ),
  ])
    assert.notEqual(key, other);
  assert.equal(
    timingKey("timings001a", { ...lyrics, provenance: "synthetic" }, 240),
    "",
  );
});
test("caption timestamps use actual cue and word offsets", () => {
  const lines = parseCaptionJson({
    events: [
      {
        tStartMs: 8000,
        dDurationMs: 2000,
        segs: [{ utf8: "First" }, { utf8: "synthetic line", tOffsetMs: 400 }],
      },
      { tStartMs: 12000, segs: [{ utf8: "Second synthetic line" }] },
    ],
  });
  assert.deepEqual(
    lines.map((l) => l.time),
    [8, 8.4, 12],
  );
  assert.equal(
    captionsMatch(
      [{ text: "First synthetic line" }, { text: "Second synthetic line" }],
      lines,
    ),
    true,
  );
  assert.equal(captionsMatch([{ text: "Wrong lyric" }], lines), false);
  assert.deepEqual(
    alignCaptionTiming(
      [{ text: "First synthetic line" }, { text: "Second synthetic line" }],
      lines,
    ).map((l) => l.time),
    [8, 12],
  );
});
test("caption recovery rejects absent line boundaries rather than distributing time", () => {
  assert.throws(() =>
    alignCaptionTiming(
      [{ text: "First synthetic line" }, { text: "Second synthetic line" }],
      [{ text: "First synthetic line Second synthetic line", time: 8 }],
    ),
  );
  assert.throws(() =>
    alignCaptionTiming([{ text: "wrong" }], [{ text: "different", time: 8 }]),
  );
});
test("empty, invalid and nonmonotonic captions are rejected", () => {
  for (const value of [
    {},
    { events: [] },
    { events: [{ tStartMs: 1000, segs: [{ utf8: "line", tOffsetMs: -5 }] }] },
    {
      events: [
        { tStartMs: 2000, segs: [{ utf8: "line" }] },
        { tStartMs: 1000, segs: [{ utf8: "next" }] },
      ],
    },
  ])
    assert.throws(() => parseCaptionJson(value));
});
