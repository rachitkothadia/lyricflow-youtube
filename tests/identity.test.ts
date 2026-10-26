import test from "node:test";
import assert from "node:assert/strict";
import { parseMetadata } from "../src/recognition/YouTubeMetadataRecognizer";
import {
  chooseCandidate,
  parseGeniusResults,
  rankCandidates,
} from "../src/lyrics/GeniusProvider";
import {
  artistSimilarity,
  artistCredits,
  evidence,
  searchQueries,
  validSong,
} from "../src/matching/identity";
import { GeniusWebProvider } from "../src/lyrics/GeniusWebProvider";
import { chooseRecord } from "../src/lyrics/LrclibProvider";
import { Candidate, Song } from "../src/model";
const candidate = (
  artists: string[],
  extra: Partial<Candidate> = {},
): Candidate => ({
  id: 1,
  title: "Paper Sun",
  artist: artists.join(" & "),
  artists,
  version: "",
  romanized: false,
  url: "https://genius.com/example-paper-sun-lyrics",
  ...extra,
});
test("collaboration grammar is invariant across artist order, connectors and featured-credit position", () => {
  const names = ["Northlight", "Mira", "Río", "Delta Unit"];
  let count = 0;
  for (const left of names)
    for (const right of names.filter((n) => n !== left))
      for (const separator of [
        " & ",
        " x ",
        ", ",
        " and ",
        " + ",
        " ft. ",
        " feat. ",
        " featuring ",
      ])
        for (const reverse of [false, true]) {
          const credits = `${left}${separator}${right}`;
          const raw = reverse
            ? `Paper Sun - ${credits}`
            : `${credits} - Paper Sun`;
          const song = parseMetadata(raw, left)!;
          assert.equal(song.title, "Paper Sun", raw);
          assert.equal(
            chooseCandidate(song, [candidate([right, left])])?.id,
            1,
            raw,
          );
          assert.equal(searchQueries(song)[0], `${left} Paper Sun`, raw);
          count++;
        }
  assert.equal(count, 192);
});
test("title feature credits and artist feature credits retain every named performer", () => {
  for (const raw of [
    "Northlight - Paper Sun ft. Mira",
    "Northlight ft. Mira - Paper Sun",
    "Northlight 'Paper Sun' feat. Mira (Official Video)",
  ]) {
    const s = parseMetadata(raw, "Northlight")!;
    assert.equal(s.title, "Paper Sun", raw);
    assert.deepEqual(s.artists, ["Northlight", "Mira"]);
    assert.equal(
      chooseCandidate(s, [candidate(["Northlight", "Mira"])])?.id,
      1,
    );
  }
});
test("provider structured co-primary and featured artists are retained, including primary-array-only responses", () => {
  for (const primary of [{ primary_artist: { name: "Northlight" } }, {}]) {
    const cs = parseGeniusResults({
      response: {
        hits: [
          {
            result: {
              id: 1,
              title: "Paper Sun",
              ...primary,
              primary_artists: [{ name: "Northlight" }, { name: "Mira" }],
              featured_artists: [{ name: "Jules" }],
              artist_names: "Northlight & Mira (Ft. Jules)",
              url: "https://genius.com/example-paper-sun-lyrics",
            },
          },
        ],
      },
    });
    assert.deepEqual(cs[0].artists, ["Northlight", "Mira", "Jules"]);
    assert.equal(
      chooseCandidate(
        {
          artist: "Mira x Northlight",
          artists: ["Mira", "Northlight", "Jules"],
          title: "Paper Sun",
          version: "",
        },
        cs,
      )?.id,
      1,
    );
  }
});
test("generic typography aliases do not require a performer lookup table", () => {
  for (const [a, b] of [
    ["K@DE", "Kade"],
    ["KE$A", "Kesa"],
    ["P!lo", "Pilo"],
    ["RÍO", "Rio"],
    ["AC/DC", "ACDC"],
  ])
    assert.equal(
      chooseCandidate({ artist: a, title: "Paper Sun", version: "" }, [
        candidate([b]),
      ])?.id,
      1,
      `${a}/${b}`,
    );
});
test("unknown collaborators, wrong artists and group-concatenation collisions cannot auto-match", () => {
  assert.equal(
    chooseCandidate(
      {
        artist: "Northlight",
        artists: ["Northlight", "Unknown"],
        title: "Paper Sun",
        version: "",
      },
      [candidate(["Northlight", "Mira"], { romanized: true })],
    ),
    null,
  );
  assert.equal(
    chooseCandidate({ artist: "Unknown", title: "Paper Sun", version: "" }, [
      candidate(["Northlight", "Mira"], { romanized: true }),
    ]),
    null,
  );
  assert.equal(
    chooseCandidate({ artist: "ABCD", title: "Paper Sun", version: "" }, [
      candidate(["A", "BCD"], { romanized: true }),
    ]),
    null,
  );
  assert.equal(
    artistSimilarity(
      { artist: "Earth", title: "Paper Sun", version: "" },
      { artist: "Earth, Wind & Fire", title: "Paper Sun", version: "" },
    ),
    0,
  );
});
test("original, live and remix identities remain separate despite exact titles and Romanization bonuses", () => {
  const song = { artist: "Northlight", title: "Paper Sun", version: "" };
  for (const version of ["live", "remix", "cover", "acoustic"])
    assert.equal(
      chooseCandidate(song, [
        candidate(["Northlight"], { version, romanized: true }),
      ]),
      null,
    );
});
test("source evidence can resolve an uncertain artist/title ordering without changing the input", () => {
  const input: Song = {
    artist: "Paper Sun",
    title: "Northlight",
    version: "",
    alternatives: [{ artist: "Northlight", title: "Paper Sun" }],
  };
  const snapshot = JSON.stringify(input);
  assert.equal(chooseCandidate(input, [candidate(["Northlight"])])?.id, 1);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(evidence(input, candidate(["Northlight"])), {
    artist: 1,
    title: 1,
    version: true,
    duration: true,
  });
});
test("search retries bounded normalized queries and deduplicates repeated provider IDs", async () => {
  const requests: string[] = [];
  const hits = {
    response: {
      hits: [
        {
          result: {
            id: 1,
            title: "Paper Sun",
            primary_artist: { name: "Northlight" },
            url: "https://genius.com/example-paper-sun-lyrics",
          },
        },
      ],
    },
  };
  const service = new GeniusWebProvider(async (url) => {
    const u = new URL(String(url));
    requests.push(String(url));
    if (u.pathname.endsWith("-lyrics"))
      return new Response(
        '<div data-lyrics-container="true">Original test line</div>',
      );
    return new Response(
      JSON.stringify(requests.length === 1 ? { response: { hits: [] } } : hits),
    );
  });
  const result = await service.resolve(
    { artist: "Northlight", title: "Paper Sun", version: "" },
    new AbortController().signal,
  );
  assert.equal(result?.kind, "genius-page");
  assert.equal(requests.length, 3);
  assert.ok(requests.filter((u) => u.includes("/api/search")).length <= 3);
});
test("collaborating credits use the same identity rules in timestamp lookup", () => {
  const song = parseMetadata("Northlight x Mira - Paper Sun", "Northlight")!;
  const r = {
    id: 1,
    trackName: "Paper Sun",
    artistName: "Northlight, Mira",
    albumName: "Album",
    instrumental: false,
    duration: 180,
    plainLyrics: "Synthetic line",
    syncedLyrics: "[00:01]Synthetic line",
  };
  assert.equal(chooseRecord(song, [r])?.id, 1);
  assert.equal(
    chooseRecord({ ...song, artists: ["Northlight", "Unknown"] }, [r]),
    null,
  );
});
test("metadata identity hints are bounded and invalid nested payloads are rejected", () => {
  assert.equal(
    validSong({ artist: "A", title: "B", version: "", artists: ["A", "B"] }),
    true,
  );
  assert.equal(
    validSong({
      artist: "A",
      title: "B",
      version: "",
      artists: Array(13).fill("A"),
    }),
    false,
  );
  assert.equal(
    validSong({
      artist: "A",
      title: "B",
      version: "",
      alternatives: [{ title: 7, artist: "A" }],
    }),
    false,
  );
});

test("presentation labels are removed without erasing real title words or recording variants", () => {
  for (const label of [
    "Official Visualizer",
    "Visualizer",
    "Official Lyric Video",
    "Lyric Video",
    "Official Audio",
    "HD",
  ])
    assert.equal(
      parseMetadata(`Northlight - Paper Sun (${label})`, "Northlight")?.title,
      "Paper Sun",
      label,
    );
  for (const title of ["Video Games", "Live It Up", "Cover Me In Sunshine"])
    assert.equal(
      parseMetadata(`Northlight - ${title}`, "Northlight")?.title,
      title,
    );
});
