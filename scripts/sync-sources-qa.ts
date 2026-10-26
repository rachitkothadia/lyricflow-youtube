import "./qa-output.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { LrclibProvider } from "../src/lyrics/LrclibProvider";
const provider = new LrclibProvider();
const cases = [
  { artist: "Dino James", title: "Still Here", duration: 270, timed: true },
  { artist: "Dino James", title: "Still Here", duration: 285, timed: true },
  { artist: "Seedhe Maut", title: "RED", duration: 304, timed: true },
  { artist: "Seedhe Maut", title: "RED", duration: 363, timed: false },
];
const results = [];
for (const item of cases) {
  const result = await provider.resolve(
    {
      artist: item.artist,
      title: item.title,
      duration: item.duration,
      version: "",
    },
    AbortSignal.timeout(30000),
  );
  assert.equal(
    result.kind,
    "ready",
    `${item.title} ${item.duration}s should resolve`,
  );
  if (result.kind !== "ready") throw new Error("Expected source lyrics");
  const timed = result.lyrics.lines.every((l) => l.time !== undefined);
  assert.equal(
    timed,
    item.timed,
    `${item.title} ${item.duration}s timing safety`,
  );
  if (timed)
    assert.ok(
      Math.abs(result.lyrics.song.duration! - item.duration) <= 8,
      "Automatic source edition must have compatible duration",
    );
  else
    assert.ok(
      result.lyrics.timingCandidates?.some((c) => c.timed && c.duration),
      "Different timed edition must remain explicit",
    );
  results.push({
    requested: item,
    selected: result.lyrics.song,
    source: result.lyrics.sourceUrl,
    lineCount: result.lyrics.lines.length,
    timed,
    timingCandidates: result.lyrics.timingCandidates?.map((c) => ({
      id: c.id,
      duration: c.duration,
      timed: c.timed,
    })),
  });
}
await writeFile(
  "output/reliability/sync-sources.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        "Live LRCLIB metadata and source timestamp availability; does not certify audio alignment",
      results,
    },
    null,
    2,
  ),
);
console.log(`${results.length} live source-edition checks passed`);
