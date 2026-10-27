import Sanscript from "@indic-transliteration/sanscript";

const vowels = new Set(["a", "ā", "i", "ī", "u", "ū", "ṛ", "ṝ", "ḷ", "ḹ", "e", "ai", "o", "au"]);
const consonant = /^(?:[kgcjṭḍtdpb]h?|[ṅñṇnmrylvśṣshqfz])$/u;
const letters: Record<string, string> = {
  ā: "aa", ī: "i", ū: "oo", ṛ: "ri", ṝ: "ri", ḷ: "li", ḹ: "li",
  ṅ: "n", ñ: "n", ṇ: "n", ṭ: "t", ḍ: "d", ś: "sh", ṣ: "sh", ḻ: "l",
  c: "ch", ch: "chh", ḥ: "h",
};

/** Only generated Indic runs pass here; existing Latin words are never respelled. */
export function readableIndic(iast: string): string {
  return iast.replace(/ch|[cāīūṛṝḷḹṅñṇṭḍśṣḻḥṃ~]/gu, (letter, index) => {
    if (letter === "ū" && /[aāiīueo]$/u.test(iast.slice(0, index))) return "u";
    if (letter === "ṃ" || letter === "~") {
      // Familiar Hindi nasal spellings: mein, hoon, rang, lambaa.
      if (iast[index - 1] === "e") return "in";
      return /^[pbm]/.test(iast.slice(index + 1)) ? "m" : "n";
    }
    return letters[letter];
  });
}

/** Hindi reading aid, not a pronunciation dictionary. Never used for other Indic scripts. */
export function readableDevanagari(run: string, literal = false): string {
  // Canonical nukta spellings must agree. Sanscript's Sanskrit mappings miss some
  // decomposed Hindi letters; these equivalents retain their familiar Roman sound.
  const nukta: Record<string, string> = {
    क: "क़", ख: "ख", ग: "घ", ज: "ज़", ड: "ड", ढ: "ढ", फ: "फ़", य: "य",
  };
  const source = run.normalize("NFD")
    .replace(/([कखगजडढफय])़/gu, (_, base: string) => nukta[base])
    .replace(/[\u200c\u200d]/gu, "")
    .replace(/ॐ/gu, "om");
  const iast = Sanscript.t(source, "devanagari", "iast");
  if (literal) return readableIndic(iast);
  return iast.replace(/[\p{L}\p{M}~]+/gu, word => {
    const parts = word.match(/kh|gh|ch|jh|ṭh|ḍh|th|dh|ph|bh|ai|au|./gu)!;
    const last = parts.length - 1;
    // Delete inherent final a only after a consonant and an earlier syllable.
    // Conjunct-final y retains its vowel (e.g. divya); written long vowels survive.
    if (parts[last] === "a" && consonant.test(parts[last - 1] || "") &&
        parts.slice(0, last).some(p => vowels.has(p)) &&
        !(parts[last - 1] === "y" && consonant.test(parts[last - 2] || "")))
      parts[last] = "";
    // Medial VCəCV → VCCV, right-to-left. Never delete into an existing cluster.
    for (let i = last - 1; i >= 2; i--)
      if (parts[i] === "a" && vowels.has(parts[i - 2]) &&
          consonant.test(parts[i - 1]) && consonant.test(parts[i + 1] || "") &&
          vowels.has(parts[i + 2])) parts[i] = "";
    return readableIndic(parts.join(""));
  });
}
