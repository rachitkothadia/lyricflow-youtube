import { LyricLine, normalize } from "../model";
export function alignLyrics(
  lyrics: LyricLine[],
  timed: LyricLine[],
): { lines: LyricLine[]; confidence: number } {
  const n = lyrics.length,
    m = timed.length;
  if (!n || !m || n > 1000 || m > 1000)
    return { lines: lyrics.map(({ time, ...l }) => l), confidence: 0 };
  const similarity = (a: string, b: string) => {
    a = normalize(a);
    b = normalize(b);
    if (a === b) return 1;
    const x = new Set(a.split(" ")),
      y = new Set(b.split(" "));
    return [...x].filter((w) => y.has(w)).length / Math.max(x.size, y.size, 1);
  };
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const s = similarity(lyrics[i].text, timed[j].text);
      dp[i][j] = Math.max(
        dp[i + 1][j],
        dp[i][j + 1],
        s >= 0.8 ? s + dp[i + 1][j + 1] : 0,
      );
    }
  let i = 0,
    j = 0;
  const matches = new Map<number, number>();
  let quality = 0;
  while (i < n && j < m) {
    const s = similarity(lyrics[i].text, timed[j].text);
    if (s >= 0.8 && Math.abs(dp[i][j] - (s + dp[i + 1][j + 1])) < 0.001) {
      matches.set(i, j);
      quality += s;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const confidence = quality / Math.max(n, m);
  const valid =
    confidence >= 0.9 &&
    matches.size === n &&
    [...matches.values()].every(
      (v, k, a) =>
        Number.isFinite(timed[v].time) &&
        timed[v].time! >= 0 &&
        (k === 0 || timed[v].time! > timed[a[k - 1]].time!),
    );
  return {
    confidence,
    lines: lyrics.map(({ time, endTime, ...l }, k) => ({
      ...l,
      ...(valid
        ? {
            time: timed[matches.get(k)!].time,
            ...(timed[matches.get(k)!].endTime !== undefined
              ? { endTime: timed[matches.get(k)!].endTime }
              : {}),
          }
        : {}),
    })),
  };
}
