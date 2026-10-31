import type { Song } from "../model";
import type { LrclibProvider, Resolution } from "./LrclibProvider";
import type { GeniusPage, GeniusWebProvider } from "./GeniusWebProvider";

/** Hedge a slow source; only providers' existing strict matches can win automatically. */
export function resolveLyrics(
  song: Song,
  lrclib: Pick<LrclibProvider, "resolve">,
  genius: Pick<GeniusWebProvider, "resolve">,
  parent: AbortSignal,
  hedgeMs = 400,
): Promise<Resolution | GeniusPage> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const signal = AbortSignal.any([parent, controller.signal]);
    let done = false,
      startedGenius = false;
    const settled = [false, false];
    const results: (Resolution | GeniusPage | null | undefined)[] = [];
    const errors: unknown[] = [];
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result?: Resolution | GeniusPage, error?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
      controller.abort();
      if (result) resolve(result);
      else reject(error);
    };
    const abort = () => finish(undefined, parent.reason);
    const accept = (
      index: number,
      result?: Resolution | GeniusPage | null,
      error?: unknown,
    ) => {
      if (done) return;
      settled[index] = true;
      results[index] = result;
      errors[index] = error;
      if (result?.kind === "ready" || result?.kind === "genius-page") {
        finish(result);
        return;
      }
      if (index === 0) startGenius();
      if (!settled.every(Boolean)) return;
      const choices = results.find((r) => r?.kind === "ambiguous");
      if (choices) finish(choices);
      else if (errors[1] || errors[0])
        finish(undefined, errors[1] || errors[0]);
      else finish(results[0] as Resolution);
    };
    const startGenius = () => {
      if (done || startedGenius) return;
      startedGenius = true;
      void Promise.resolve()
        .then(() => genius.resolve(song, signal))
        .then(
          (value) => accept(1, value),
          (error) => accept(1, undefined, error),
        );
    };
    if (parent.aborted) {
      abort();
      return;
    }
    parent.addEventListener("abort", abort, { once: true });
    timer = setTimeout(startGenius, hedgeMs);
    void Promise.resolve()
      .then(() => lrclib.resolve(song, signal, true))
      .then(
        (value) => accept(0, value),
        (error) => accept(0, undefined, error),
      );
  });
}
