export function watchVideo(doc = document): HTMLVideoElement | null {
  return (
    doc.querySelector<HTMLVideoElement>(
      "#movie_player video.html5-main-video",
    ) ||
    doc.querySelector<HTMLVideoElement>("#movie_player video") ||
    doc.querySelector<HTMLVideoElement>("ytd-watch-flexy video") ||
    doc.querySelector("video")
  );
}
export function playingAd(video: HTMLVideoElement | null): boolean {
  return !!video?.closest(".ad-showing,.ad-interrupting");
}
export function recordingDuration(
  video: HTMLVideoElement | null,
): number | undefined {
  return video &&
    !playingAd(video) &&
    Number.isFinite(video.duration) &&
    video.duration > 0
    ? video.duration
    : undefined;
}
