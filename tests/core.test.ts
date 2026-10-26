import test from "node:test";
import assert from "node:assert/strict";
import { parseMetadata } from "../src/recognition/YouTubeMetadataRecognizer";
import { SeekTuneAdapter } from "../src/recognition/SeekTuneAdapter";
import {
  chooseCandidate,
  parseGeniusResults,
  rankCandidates,
} from "../src/lyrics/GeniusProvider";
import { parseImport, parseLines } from "../src/lyrics/parse";
import { alignLyrics } from "../src/lyrics/LyricsMatcher";
import { activeLine } from "../src/timing/PlaybackSynchronizer";
import { Candidate, ProviderError, Song, safeGeniusUrl } from "../src/model";

const song: Song = {
  title: "Sakura",
  artist: "Hana",
  version: "",
  duration: 180,
};
const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  ...song,
  id: 1,
  url: "https://genius.com/Hana-sakura-romanized-lyrics",
  romanized: true,
  ...overrides,
});
const imported = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    song,
    romanized: true,
    provenance: "user-confirmed",
    sourceUrl: candidate().url,
    lines: [
      { text: "Sakura no hana", section: "Verse", time: 0 },
      { text: "Kaze ni yurete", time: 8 },
    ],
    ...overrides,
  });

test("metadata removes promotional labels without losing artist or recording version", () => {
  assert.deepEqual(
    parseMetadata("Hana – Sakura (Official Music Video)", "Label", 180),
    song,
  );
  assert.deepEqual(
    parseMetadata("Hana - Sakura [LIVE] | Concert 2026", "Label"),
    {
      title: "Sakura LIVE",
      artist: "Hana",
      version: "live",
      duration: undefined,
    },
  );
});

test("metadata falls back to channel artist and rejects empty titles", () => {
  assert.equal(parseMetadata("   ", "Hana"), null);
  assert.equal(
    parseMetadata("Sakura (Lyrics)", "Hana - Topic", Infinity)?.artist,
    "Hana",
  );
  assert.equal(parseMetadata("Sakura", "HanaVEVO")?.artist, "Hana");
  assert.equal(parseMetadata("Sakura", "Hana", NaN)?.duration, undefined);
});

test("matching prefers exact Romanized recording and leaves original candidate list unchanged", () => {
  const input = [candidate({ id: 2, artist: "Another artist" }), candidate()];
  const result = rankCandidates(song, input);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].score, 1);
  assert.equal(input[0].id, 2);
  assert.equal(input[0].score, undefined);
  assert.equal(chooseCandidate(song, input)?.id, 1);
});

test("matching normalizes punctuation, case and diacritics", () => {
  assert.equal(
    chooseCandidate({ ...song, title: "SÁKURA!", artist: "HANA" }, [
      candidate(),
    ])?.id,
    1,
  );
});

test("ambiguous equally ranked songs require correction instead of automatic selection", () => {
  assert.equal(
    chooseCandidate(song, [candidate(), candidate({ id: 2 })]),
    null,
  );
  assert.equal(chooseCandidate(song, []), null);
  assert.equal(
    chooseCandidate(song, [
      candidate({ title: "Unrelated", artist: "Someone else" }),
    ]),
    null,
  );
});

test("live, remix and materially different duration cannot silently replace the requested recording", () => {
  for (const version of [
    "live",
    "remix",
    "acoustic",
    "cover",
    "instrumental",
    "slowed",
    "sped up",
  ]) {
    assert.equal(
      chooseCandidate(song, [candidate({ version })]),
      null,
      version,
    );
  }
  assert.equal(chooseCandidate(song, [candidate({ duration: 189 })]), null);
  assert.equal(chooseCandidate(song, [candidate({ duration: 188 })])?.id, 1);
});

test("Genius result parser accepts canonical source and detects Romanized variants", () => {
  const rows = parseGeniusResults({
    response: {
      hits: [
        {
          result: {
            id: 17,
            title: "Sakura (Romanized) Live",
            primary_artist: { name: "Hana" },
            url: candidate().url,
          },
        },
      ],
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].romanized, true);
  assert.equal(rows[0].version, "live");
  assert.equal(rows[0].artist, "Hana");
});

test("Genius parser rejects malformed responses and discards unsafe or incomplete hits", () => {
  assert.throws(() => parseGeniusResults({}), /unexpected response/);
  const result = {
    id: 1,
    title: "Sakura",
    primary_artist: { name: "Hana" },
    url: candidate().url,
  };
  assert.deepEqual(
    parseGeniusResults({
      response: {
        hits: [
          null,
          {},
          { result: { ...result, id: "1" } },
          { result: { ...result, url: "https://genius.com.evil.test/song" } },
          { result: { ...result, primary_artist: {} } },
        ],
      },
    }),
    [],
  );
  assert.equal(
    parseGeniusResults({
      response: { hits: Array.from({ length: 25 }, () => ({ result })) },
    }).length,
    20,
  );
});

test("source URLs reject credentials, alternate hosts and insecure protocols", () => {
  assert.equal(safeGeniusUrl(candidate().url), candidate().url);
  for (const value of [
    "http://genius.com/song",
    "https://evil.test/song",
    "https://genius.com.evil.test/song",
    "https://user:pass@genius.com/song",
    "https://genius.com:444/song",
    "javascript:alert(1)",
    undefined,
  ]) {
    assert.throws(() => safeGeniusUrl(value));
  }
});

test("plain lyrics preserve script and repeated lines while assigning section headings", () => {
  assert.deepEqual(
    parseLines(
      " [Verse 1]\r\n Sakura no hana \r\n\r\n Sakura no hana\r\n[Chorus]\r\n春の花",
    ),
    [
      { text: "Sakura no hana", section: "Verse 1" },
      { text: "Sakura no hana", section: "Verse 1" },
      { text: "春の花", section: "Chorus" },
    ],
  );
  assert.deepEqual(parseLines("  \n"), []);
  assert.throws(() => parseLines("<script>alert(1)</script>"), /plain text/);
});

test("import accepts confirmed Romanized lyrics, zero timestamp and untimed reading", () => {
  const result = parseImport(imported());
  assert.equal(result.lines[0].time, 0);
  assert.equal(result.lines[1].time, 8);
  assert.equal(result.provenance, "user-confirmed");
  const untimed = parseImport(
    imported({ lines: [{ text: "  Sakura  ", section: "Verse" }] }),
  );
  assert.deepEqual(untimed.lines, [
    { text: "Sakura", section: "Verse", time: undefined },
  ]);
});

test("import requires explicit Romanized and rights confirmation plus complete recording identity", () => {
  for (const overrides of [
    { romanized: false },
    { provenance: "synthetic" },
    { song: { title: "Sakura", artist: "Hana" } },
  ]) {
    assert.throws(() => parseImport(imported(overrides)));
  }
});

test("import rejects mixed, duplicate, descending, negative and nonnumeric timestamps", () => {
  for (const lines of [
    [{ text: "a", time: 0 }, { text: "b" }],
    [
      { text: "a", time: 1 },
      { text: "b", time: 1 },
    ],
    [
      { text: "a", time: 2 },
      { text: "b", time: 1 },
    ],
    [{ text: "a", time: -1 }],
    [{ text: "a", time: "5" }],
    [{ text: "a", time: null }],
  ])
    assert.throws(() => parseImport(imported({ lines })));
});

test("import rejects HTML, empty or oversized lines, malformed sections and oversized files", () => {
  for (const lines of [
    [],
    [{ text: " " }],
    [{ text: "<img src=x>" }],
    [{ text: "x".repeat(1001) }],
    [{ text: "a", section: 1 }],
    Array.from({ length: 1001 }, () => ({ text: "a" })),
  ]) {
    assert.throws(() => parseImport(imported({ lines })));
  }
  assert.throws(() => parseImport(" ".repeat(150001)), /150 KB/);
  assert.throws(
    () => parseImport(imported({ sourceUrl: "https://example.com" })),
    /source link/,
  );
});

test("alignment preserves authoritative Romanized text and sections while transferring verified times", () => {
  const lyrics = [
    { text: "Sákura, no hana!", section: "Verse" },
    { text: "Kaze ni yurete", section: "Chorus" },
  ];
  const result = alignLyrics(lyrics, [
    { text: "sakura no hana", time: 0 },
    { text: "kaze ni yurete", time: 8 },
  ]);
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.lines, [
    { ...lyrics[0], time: 0 },
    { ...lyrics[1], time: 8 },
  ]);
});

test("alignment maps repeated choruses in sequence", () => {
  const lyrics = ["Sakura", "Kaze", "Sakura"].map((text) => ({ text }));
  assert.deepEqual(
    alignLyrics(
      lyrics,
      lyrics.map((line, i) => ({ ...line, time: i * 10 })),
    ).lines.map((line) => line.time),
    [0, 10, 20],
  );
});

test("partial or different-script timing remains unsynced and removes stale times", () => {
  const lyrics = [
    { text: "Sakura", time: 99 },
    { text: "Kaze", time: 100 },
  ];
  for (const timed of [
    [],
    [{ text: "Sakura", time: 0 }],
    [
      { text: "桜", time: 0 },
      { text: "風", time: 10 },
    ],
  ]) {
    const result = alignLyrics(lyrics, timed);
    assert.ok(result.confidence < 0.9);
    assert.ok(result.lines.every((line) => line.time === undefined));
  }
});

test("alignment refuses absent, nonfinite, negative or nonincreasing timing even at full text confidence", () => {
  const lyrics = [{ text: "Sakura" }, { text: "Kaze" }];
  for (const times of [
    [undefined, undefined],
    [NaN, 8],
    [-1, 8],
    [1, 1],
    [8, 0],
  ]) {
    const result = alignLyrics(
      lyrics,
      lyrics.map((line, i) => ({ ...line, time: times[i] })),
    );
    assert.equal(result.confidence, 1);
    assert.ok(result.lines.every((line) => line.time === undefined));
  }
});

test("active line handles start boundaries, gaps, seeking backward and end of playback", () => {
  const lines = [
    { text: "a", time: 3 },
    { text: "b", time: 8 },
    { text: "c", time: 12 },
  ];
  for (const [time, expected] of [
    [0, -1],
    [3, 0],
    [7.999, 0],
    [8, 1],
    [12, 2],
    [90, 2],
    [4, 0],
  ])
    assert.equal(activeLine(lines, time), expected);
  assert.equal(activeLine(lines, 13, true), -1);
});

test("active line never fabricates timing for untimed or invalid playback state", () => {
  assert.equal(activeLine([], 0), -1);
  assert.equal(activeLine([{ text: "a" }], 10), -1);
  assert.equal(activeLine([{ text: "a", time: 0 }, { text: "b" }], 10), -1);
  for (const time of [NaN, Infinity, -Infinity])
    assert.equal(activeLine([{ text: "a", time: 0 }], time), -1);
});

test("SeekTune reports unavailable without starting capture and honors cancellation first", async () => {
  const adapter = new SeekTuneAdapter();
  await assert.rejects(
    adapter.recognize(new AbortController().signal),
    (error) =>
      error instanceof ProviderError && error.code === "recognizer-unavailable",
  );
  const controller = new AbortController();
  const reason = new Error("Navigation canceled recognition");
  controller.abort(reason);
  await assert.rejects(
    adapter.recognize(controller.signal),
    (error) => error === reason,
  );
});

test("metadata keeps recording versions after publisher separators", () => {
  for (const separator of ["|", "｜"]) {
    for (const label of [
      "Live",
      "Remix",
      "Acoustic",
      "Sped Up",
      "Slowed",
      "Instrumental",
      "Cover",
    ]) {
      const parsed = parseMetadata(
        `Hana - Sakura ${separator} ${label}`,
        "Label",
      );
      assert.equal(parsed?.title, "Sakura");
      assert.equal(parsed?.artist, "Hana");
      assert.equal(parsed?.version, label.toLowerCase());
      assert.equal(
        chooseCandidate(parsed!, [candidate()]),
        null,
        `must not select studio for ${label}`,
      );
    }
  }
  assert.equal(
    parseMetadata("Hana - Sakura | Lyrics | Slowed", "Label")?.version,
    "slowed",
  );
  assert.equal(
    parseMetadata("Hana - Sakura (Live) | Live at Concert 2026", "Label")
      ?.version,
    "live",
  );
  assert.equal(
    parseMetadata("Hana - Sakura | Sped   Up", "Label")?.version,
    "sped up",
  );
  assert.equal(
    parseMetadata("Hana - Sakura | Concert 2026", "Label")?.version,
    "",
  );
});

test("Genius no-match responses produce an empty candidate list", () => {
  assert.deepEqual(parseGeniusResults({ response: { hits: [] } }), []);
  assert.equal(
    chooseCandidate(song, parseGeniusResults({ response: { hits: [] } })),
    null,
  );
});

test("Genius result parser discards nonfinite song identifiers", () => {
  const result = {
    title: "Sakura",
    primary_artist: { name: "Hana" },
    url: candidate().url,
  };
  assert.deepEqual(
    parseGeniusResults({
      response: {
        hits: [NaN, Infinity, -Infinity].map((id) => ({
          result: { ...result, id },
        })),
      },
    }),
    [],
  );
});

test("import rejects blank song title or artist while allowing studio version", () => {
  for (const recording of [
    { ...song, title: "" },
    { ...song, title: " \t " },
    { ...song, artist: "" },
    { ...song, artist: " \n " },
  ]) {
    assert.throws(
      () => parseImport(imported({ song: recording })),
      /Missing song/,
    );
  }
  assert.equal(parseImport(imported()).song.version, "");
});

test("Genius Romanizations composite titles recover explicit recording identity", () => {
  const candidates = parseGeniusResults({
    response: {
      hits: [
        {
          result: {
            id: 17,
            title: "Hana - Sakura (Romanized)",
            primary_artist: { name: "Genius Romanizations" },
            url: candidate().url,
          },
        },
      ],
    },
  });
  assert.equal(candidates[0].artist, "Hana");
  assert.equal(candidates[0].title, "Sakura");
  assert.equal(candidates[0].url, candidate().url);
  assert.equal(candidates[0].romanized, true);
  assert.equal(chooseCandidate(song, candidates)?.id, 17);
});

test("explicit Romanized suffix does not penalize an otherwise exact recording", () => {
  assert.equal(
    chooseCandidate(song, [candidate({ title: "Sakura (Romanized)" })])?.id,
    1,
  );
  assert.equal(
    chooseCandidate(song, [candidate({ title: "Sakura [Romanized]" })])?.id,
    1,
  );
});

test("Romanizations titles without explicit unambiguous identity never force a match", () => {
  for (const title of [
    "Sakura (Romanized)",
    "Hana - Sakura",
    "Hana - Sakura (English Translation)",
  ]) {
    const candidates = parseGeniusResults({
      response: {
        hits: [
          {
            result: {
              id: 17,
              title,
              primary_artist: { name: "Genius Romanizations" },
              url: candidate().url,
            },
          },
        ],
      },
    });
    assert.equal(candidates[0].artist, "Genius Romanizations");
    assert.equal(chooseCandidate(song, candidates), null);
  }
  assert.equal(
    chooseCandidate(song, [
      candidate({ title: "Sakura (Romanized)" }),
      candidate({ id: 2, title: "Sakura (Romanized)" }),
    ]),
    null,
  );
});

test("import rejects native-script text despite a Romanized flag", () => {
  assert.throws(
    () => parseImport(imported({ lines: [{ text: "こんにちは" }] })),
    /Romanized Latin-script/,
  );
});

test("quoted bilingual YouTube metadata tolerates surrounding newlines", () => {
  const song = parseMetadata("\n  BTS (방탄소년단) '봄날 (Spring Day)' Official MV\n", "HYBE LABELS", 329);
  assert.equal(song?.artist, "BTS");
  assert.equal(song?.title, "Spring Day");
});

test("song-first title uses the verified artist channel and drops album suffix", () => {
  const song = parseMetadata("UNDERPRESSURE - KARMA X SIYAAHI - MAD DAWG 101| OFFICIAL AUDIO | 2026", "KARMA");
  assert.equal(song?.artist, "KARMA");assert.equal(song?.title, "UNDERPRESSURE");
});
test("artist-channel cleanup preserves meaningful recording version", () => {
  const song = parseMetadata("Karma - Song - Album | Live", "Karma");
  assert.equal(song?.title, "Song");assert.equal(song?.version, "live");
});

test("song-first numeric titles accept an unspaced dash before collaborator credits", () => {
  const result = parseMetadata("101- KARMA X NAAM SUJAL | MAD DAWG 101| OFFICIAL AUDIO | 2026", "KARMA");
  assert.equal(result?.title, "101");assert.equal(result?.artist, "KARMA");
});
test("dash separator normalization preserves hyphenated artist and song names", () => {
  assert.equal(parseMetadata("AC-DC - Thunderstruck", "AC-DC")?.artist, "AC-DC");
  assert.equal(parseMetadata("Artist - Love-Story", "Artist")?.title, "Love-Story");
});
