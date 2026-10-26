import test from "node:test";
import assert from "node:assert/strict";
import { romanizeLines } from "../src/lyrics/romanize";

test("existing Latin lyrics preserve casing, punctuation, diacritics and timing", async () => {
  const input = [{ text: "Hello, café!  déjà-vu", time: 1.25, section: "Verse" }];
  const result = await romanizeLines(input);
  assert.deepEqual(result.lines, input);
  assert.equal(result.mode, "existing");
  assert.deepEqual(result.unsupported, []);
});
test("Devanagari becomes IAST without changing source or line timing", async () => {
  const input = [{ text: "नमस्ते", time: 4, section: "Intro" }];
  const result = await romanizeLines(input);
  assert.equal(result.lines[0].text, "namaste");
  assert.equal(result.lines[0].time, 4);
  assert.equal(result.lines[0].section, "Intro");
  assert.equal(result.lines[0].originalText, "नमस्ते");
  assert.equal(input[0].text, "नमस्ते");
  assert.equal(result.mode, "generated");
});
test("Indic fallback handles script runs while preserving adjacent English", async () => {
  const result = await romanizeLines([{ text: "HELLO ગુજરાતી" }]);
  assert.match(result.lines[0].text, /^HELLO /);
  assert.doesNotMatch(result.lines[0].text, /\p{Script=Gujarati}/u);
  assert.equal(result.unsupported.length, 0);
});
test("Korean pronunciation rules handle nasal assimilation", async () => {
  const result = await romanizeLines([{ text: "국물 Hello!" }]);
  assert.equal(result.lines[0].text, "gungmul Hello!");
  assert.equal(result.mode, "generated");
});
test("Mandarin uses phrase-aware Pinyin and keeps original line count", async () => {
  const result = await romanizeLines([{ text: "你好" }, { text: "Hello" }]);
  assert.equal(result.lines[0].text, "nǐ hǎo");
  assert.equal(result.lines[1].text, "Hello");
  assert.equal(result.lines.length, 2);
});
test("Japanese dictionary converts kana and Kanji without Mandarin readings", async () => {
  const result = await romanizeLines([{ text: "こんにちは" }, { text: "日本" }]);
  assert.match(result.lines[0].text, /konnichi/);
  assert.doesNotMatch(result.lines[1].text, /\p{Script=Han}/u);
  assert.equal(result.unsupported.length, 0);
  assert.ok(!result.systems.includes("Mandarin Pinyin"));
});
test("known Japanese Han-only text uses Japanese dictionary", async () => {
  const result = await romanizeLines([{ text: "日本", time: 8 }], { language: "ja" });
  assert.match(result.lines[0].text, /ni(h|p)/);
  assert.equal(result.lines[0].time, 8);
  assert.equal(result.unsupported.length, 0);
});
test("unsupported writing systems stay original with explicit limitations", async () => {
  const result = await romanizeLines([{ text: "مرحبا" }]);
  assert.equal(result.lines[0].text, "مرحبا");
  assert.ok(result.unsupported.length > 0);
});
test("empty input is a valid no-op", async () => {
  assert.deepEqual(await romanizeLines([]), { lines: [], mode: "existing", unsupported: [], systems: [] });
});

test("browser dictionary paths preserve extension and HTTP URL schemes", async () => {
  const { join } = await import("../src/lyrics/browserPath");
  assert.equal(join("chrome-extension://abc/dict/", "base.dat.gz"), "chrome-extension://abc/dict/base.dat.gz");
  assert.equal(join("https://example.test/dict/", "base.dat.gz"), "https://example.test/dict/base.dat.gz");
  assert.equal(join("/dict/", "base.dat.gz"), "/dict/base.dat.gz");
});
