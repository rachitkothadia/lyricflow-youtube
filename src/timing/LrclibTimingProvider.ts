import { LyricLine, ProviderError, Song, TimingProvider } from "../model";
export class LrclibTimingProvider implements TimingProvider {
  async get(_song: Song, signal: AbortSignal): Promise<LyricLine[]> {
    signal.throwIfAborted();
    throw new ProviderError(
      "timing-access-unverified",
      "Live timing is not enabled. Import authorized timestamps; readable lyrics remain available without timing.",
    );
  }
}
