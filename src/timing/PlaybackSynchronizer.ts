import { LyricLine } from "../model";
/** Inverse of highlight time, bounded to the recording's actual seekable ranges. */
export function lyricSeekTime(time: number, offset: number, duration: number, ranges: Array<{start: number; end: number}>): number | null {
  if (!Number.isFinite(time) || !Number.isFinite(offset)) return null;
  const valid = ranges.filter(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  if (!valid.length && Number.isFinite(duration) && duration > 0) valid.push({start: 0, end: duration});
  const target = time + offset;
  const candidates = valid.map(r => Math.max(r.start, Math.min(r.end - Math.min(.01, (r.end - r.start) / 2), target)));
  return candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] ?? null;
}
export function activeLine(
  lines: LyricLine[],
  time: number,
  ended = false,
): number {
  if (
    ended ||
    !Number.isFinite(time) ||
    !lines.length ||
    lines.some((l) => l.time === undefined)
  )
    return -1;
  let lo = 0,
    hi = lines.length - 1,
    result = -1;
  // Browsers can round a seek down by a microsecond. Keep exact lyric seeks on that line.
  const alignedTime = time + .00001;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time! <= alignedTime) {
      result = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return result >= 0 && lines[result].endTime !== undefined && alignedTime >= lines[result].endTime! ? -1 : result;
}
export class PlaybackSynchronizer {
  private frame = 0;
  private last = -2;
  offset = 0;
  private events = [
    "play",
    "pause",
    "seeking",
    "seeked",
    "ratechange",
    "timeupdate",
    "ended",
    "loadedmetadata",
  ];
  constructor(
    private video: HTMLVideoElement,
    private lines: LyricLine[],
    private change: (index: number) => void,
  ) {
    this.events.forEach((e) => video.addEventListener(e, this.tick));
    document.addEventListener("visibilitychange", this.tick);
    this.tick();
  }
  private tick = () => {
    cancelAnimationFrame(this.frame);
    const index = activeLine(
      this.lines,
      this.video.currentTime - this.offset,
      this.video.ended,
    );
    if (index !== this.last) {
      this.last = index;
      this.change(index);
    }
    if (!this.video.paused && !this.video.ended && !document.hidden)
      this.frame = requestAnimationFrame(this.tick);
  };
  setOffset(value: number) {
    this.offset = value;
    this.tick();
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.events.forEach((e) => this.video.removeEventListener(e, this.tick));
    document.removeEventListener("visibilitychange", this.tick);
  }
}
