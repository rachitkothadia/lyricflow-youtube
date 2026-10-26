import Sanscript from "@indic-transliteration/sanscript";
import { romanize as korean } from "koroman";
import { pinyin } from "pinyin-pro";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import type { LyricLine } from "../model";

export interface RomanizationResult {
  lines: (LyricLine & { originalText?: string })[];
  mode: "existing" | "generated";
  /** Readable limitations, never lyric content. */
  unsupported: string[];
  systems: string[];
}
export interface RomanizationOptions {
  /** Han alone is ambiguous: a known Japanese source must use ja. */
  language?: "ja" | "zh" | "ko";
  dictionaryPath?: string;
}
const indic: [RegExp, string, string][] = [
  [/[\u0900-\u097f]+/gu, "devanagari", "Devanagari → IAST"],
  [/[\u0980-\u09ff]+/gu, "bengali", "Bengali → IAST"],
  [/[\u0a00-\u0a7f]+/gu, "gurmukhi", "Gurmukhi → IAST"],
  [/[\u0a80-\u0aff]+/gu, "gujarati", "Gujarati → IAST"],
  [/[\u0b00-\u0b7f]+/gu, "oriya", "Odia → IAST"],
  [/[\u0b80-\u0bff]+/gu, "tamil", "Tamil → IAST"],
  [/[\u0c00-\u0c7f]+/gu, "telugu", "Telugu → IAST"],
  [/[\u0c80-\u0cff]+/gu, "kannada", "Kannada → IAST"],
  [/[\u0d00-\u0d7f]+/gu, "malayalam", "Malayalam → IAST"],
];
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const hangul = /\p{Script=Hangul}/u;
const han = /\p{Script=Han}/u;
let japaneseEngine: Promise<Kuroshiro> | undefined;
let japaneseDictionary: string | undefined;
function japaneseAnalyzer(dictionaryPath?: string): Promise<Kuroshiro> {
  const path = dictionaryPath ?? (typeof chrome !== "undefined" && chrome.runtime?.getURL
    ? chrome.runtime.getURL("dict/") : "node_modules/kuromoji/dict/");
  if (!japaneseEngine || japaneseDictionary !== path) {
    japaneseDictionary = path;
    const instance = new Kuroshiro();
    japaneseEngine = instance.init(new KuromojiAnalyzer({ dictPath: path }))
      .then(() => instance).catch(error => { japaneseEngine = undefined; throw error; });
  }
  return japaneseEngine;
}
const nonLatinLetter = /(?:(?!\p{Script=Latin})\p{L})/u;

/** Local algorithmic transliteration; never translation or verified singing pronunciation.
 * Latin runs remain byte-for-byte unchanged; source lines are never mutated.
 * No network, logging, persistence, remote code, or lyric-content telemetry.
 */
export async function romanizeLines(
  lines: LyricLine[], options: RomanizationOptions = {},
): Promise<RomanizationResult> {
  const unsupported = new Set<string>();
  const systems = new Set<string>();
  const japanese = options.language === "ja" || lines.some(line => kana.test(line.text));
  const koreanContext = options.language === "ko" || lines.some(line => hangul.test(line.text));
  let changed = false;
  let engine: Kuroshiro | undefined;
  if (japanese) {
    try { engine = await japaneseAnalyzer(options.dictionaryPath); }
    catch { unsupported.add("Japanese reading dictionary could not load; original Japanese retained"); }
  }
  const output = [];
  for (const line of lines) {
    let text = line.text;
    for (const [pattern, scheme, label] of indic) {
      text = text.replace(pattern, run => {
        // Schemes not shipped by a library version must remain original.
        if (!Sanscript.schemes[scheme]) {
          unsupported.add(`${scheme} script is unavailable`);
          return run;
        }
        systems.add(label);
        return Sanscript.t(run, scheme, "iast");
      });
    }
    text = text.replace(/[\p{Script=Hangul}]+/gu, run => {
      systems.add("Korean Revised Romanization");
      return korean(run.normalize("NFC"), { usePronunciationRules: true, useCustomDictionary: false });
    });
    // Convert whole Japanese script runs for word readings and particles, preserving Latin text.
    if (japanese && engine) {
      const pattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+/gu;
      const runs = [...text.matchAll(pattern)];
      for (const run of runs.reverse()) {
        const converted = await engine.convert(run[0], { to: "romaji", mode: "spaced", romajiSystem: "hepburn" });
        const index = run.index!;
        text = text.slice(0, index) + converted + text.slice(index + run[0].length);
        systems.add("Japanese dictionary-based Hepburn Romaji");
      }
    } else if (!japanese && han.test(text)) {
      // Korean Hanja must never receive Mandarin readings.
      if (koreanContext && options.language !== "zh") {
        unsupported.add("Korean Hanja needs language-specific readings; original characters retained");
      } else {
        text = text.replace(/\p{Script=Han}+/gu, run => {
          systems.add("Mandarin Pinyin");
          return pinyin(run, { toneType: "symbol" });
        });
      }
    }
    if (nonLatinLetter.test(text)) unsupported.add("Some characters have no supported local Romanization; original text retained");
    if (text !== line.text) {
      changed = true;
      output.push({ ...line, originalText: line.text, text });
    } else output.push({ ...line });
  }
  return { lines: output, mode: changed ? "generated" : "existing", unsupported: [...unsupported], systems: [...systems] };
}
