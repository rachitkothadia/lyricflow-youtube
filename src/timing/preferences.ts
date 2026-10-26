import { Lyrics } from "../model";
export type TimingCorrection = { base: number; fine: number; updated?: number };
export function validCorrection(value: unknown): value is TimingCorrection {
  const v = value as TimingCorrection;
  return (
    !!v &&
    typeof v.base === "number" &&
    Number.isFinite(v.base) &&
    Math.abs(v.base) <= 86400 &&
    typeof v.fine === "number" &&
    Number.isFinite(v.fine) &&
    Math.abs(v.fine) <= 10 &&
    Math.abs(v.fine * 10 - Math.round(v.fine * 10)) < 0.000001
  );
}
export function timingKey(
  videoId: string,
  lyrics: Lyrics,
  duration?: number,
): string {
  if (!/^[\w-]{11}$/.test(videoId) || lyrics.provenance === "synthetic")
    return "";
  const text = JSON.stringify([
    lyrics.sourceUrl,
    Math.round(duration || 0),
    lyrics.lines.map((l) => [l.text, l.time, l.endTime]),
  ]);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return (
    videoId +
    ":" +
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
export function calibrationOffset(
  currentTime: number,
  lineTime: number,
): number {
  if (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(lineTime) ||
    currentTime < 0 ||
    lineTime < 0
  )
    throw new Error("Wait for the song to load before aligning it.");
  return Math.round((currentTime - lineTime) * 10) / 10;
}
