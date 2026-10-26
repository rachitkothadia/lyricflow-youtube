import { ProviderError, Song, SongRecognizer } from "../model";
// Contract for a future, explicitly user-activated capture implementation. No capture occurs here.
export interface FingerprintTransport {
  recognize(
    pcm: Float32Array,
    sampleRate: number,
    signal: AbortSignal,
  ): Promise<Song | null>;
}
export class SeekTuneAdapter implements SongRecognizer {
  async recognize(signal: AbortSignal): Promise<Song | null> {
    signal.throwIfAborted();
    throw new ProviderError(
      "recognizer-unavailable",
      "Audio recognition is not configured. Use song correction or metadata matching.",
    );
  }
}
