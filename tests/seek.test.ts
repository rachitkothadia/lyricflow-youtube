import test from "node:test";
import assert from "node:assert/strict";
import {activeLine, lyricSeekTime} from "../src/timing/PlaybackSynchronizer";

test("lyric seeking reverses highlight offsets without changing the source timestamps", () => {
  const lines = [0, 4, 8, 12].map(time => ({text: "Synthetic line", time}));
  for (const offset of [-10, -1.3, 0, .1, 2.4, 10]) {
    const target = lyricSeekTime(12, offset, 60, [])!;
    assert.equal(activeLine(lines, target - offset), 3);
  }
  assert.deepEqual(lines.map(l => l.time), [0, 4, 8, 12]);
});
test("browser microsecond rounding after an offset seek still activates the selected line", () => {
  const lines = [{text:"Earlier line", time:27.86}, {text:"Selected line", time:31.77}];
  assert.equal(activeLine(lines, 32.369999 - .6), 1);
  assert.equal(activeLine(lines, 31.76), 0);
});
test("seeking clamps negative intros and unavailable recording tails", () => {
  assert.equal(lyricSeekTime(0, -10, 60, []), 0);
  assert.equal(lyricSeekTime(70, 10, 60, []), 59.99);
});
test("live DVR seeking stays inside actual seekable windows including gaps", () => {
  const ranges = [{start: 100, end: 120}, {start: 140, end: 180}];
  assert.equal(lyricSeekTime(50, 2, Infinity, ranges), 100);
  assert.equal(lyricSeekTime(150, -2, Infinity, ranges), 148);
  assert.equal(lyricSeekTime(130, 1, Infinity, ranges), 140);
  assert.equal(lyricSeekTime(200, 1, Infinity, ranges), 179.99);
});
test("unseekable live playback and invalid timestamps do not invent a target", () => {
  assert.equal(lyricSeekTime(5, 0, Infinity, []), null);
  assert.equal(lyricSeekTime(5, 0, 0, []), null);
  assert.equal(lyricSeekTime(NaN, 0, 60, []), null);
  assert.equal(lyricSeekTime(5, Infinity, 60, []), null);
});
