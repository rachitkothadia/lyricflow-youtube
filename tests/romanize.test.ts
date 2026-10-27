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
test("Devanagari becomes readable Romanization without changing source or line timing", async () => {
  const input = [{ text: "नमस्ते", time: 4, section: "Intro" }];
  const result = await romanizeLines(input);
  assert.equal(result.lines[0].text, "namaste");
  assert.equal(result.lines[0].time, 4);
  assert.equal(result.lines[0].section, "Intro");
  assert.equal(result.lines[0].originalText, "नमस्ते");
  assert.equal(input[0].text, "नमस्ते");
  assert.equal(result.mode, "generated");
});
test("Hindi removes unsung inherent vowels instead of displaying Sanskrit spellings", async () => {
  const result = await romanizeLines([{ text: "संग मैं अलग" }, { text: "कमल भारत धड़कन करना" }]);
  assert.deepEqual(result.lines.map(l => l.text), ["sang main alag", "kamal bhaarat dhadkan karnaa"]);
});
test("Hindi nasal vowels and consonants use familiar letters instead of dots or tildes", async () => {
  const result = await romanizeLines([{ text: "हूँ हैं में हाँ आँख लंबा रंग नहीं जाऊँ" }]);
  assert.equal(result.lines[0].text, "hoon hain mein haan aankh lambaa rang nahin jaaun");
});
test("Hindi keeps written vowels, aspirates and consonant clusters", async () => {
  const result = await romanizeLines([{ text: "आशा इच्छा नया दिया प्यार नमस्ते नमस्कार" }]);
  assert.equal(result.lines[0].text, "aashaa ichchhaa nayaa diyaa pyaar namaste namaskaar");
});
test("Hindi nukta letters agree in composed and decomposed source spellings", async () => {
  const text = "क़िला ख़बर ग़ज़ल फ़िक्र सड़क पढ़ना";
  const result = await romanizeLines([{ text }, { text: "क़िला ख़बर ग़ज़ल फ़िक्र सड़क पढ़ना" }]);
  assert.deepEqual(result.lines.map(l => l.text), Array(2).fill("qilaa khabar ghazal fikr sadak padhnaa"));
});
test("Hindi joins remain readable and preserve source, punctuation and all timing fields", async () => {
  const input = [{ text: "HELLO, café! प्\u200dयार — क्\u200cया?", time: 2.3, endTime: 5.7, section: "Test" }];
  const original = structuredClone(input);
  const result = await romanizeLines(input);
  assert.deepEqual(input, original);
  assert.deepEqual(result.lines[0], { ...input[0], originalText: input[0].text, text: "HELLO, café! pyaar — kyaa?" });
  assert.ok(result.systems.includes("Hindi-style Romanization"));
});
test("other Indic scripts use readable letters without applying Hindi vowel deletion", async () => {
  const result = await romanizeLines([{ text: "தமிழ் ગુજરાતી" }]);
  assert.doesNotMatch(result.lines[0].text, /[āīūṃṇṭḍśṣ~]/u);
  assert.match(result.lines[0].text, /gujaraati/);
});
test("literal Devanagari mode retains inherent vowels for non-Hindi readings", async () => {
  const result = await romanizeLines([{ text: "कमल भारत" }], { language: "sa" });
  assert.equal(result.lines[0].text, "kamala bhaarata");
  assert.ok(result.systems.includes("Literal Devanagari Romanization"));
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
