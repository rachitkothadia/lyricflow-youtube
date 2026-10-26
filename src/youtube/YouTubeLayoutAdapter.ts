import { FullscreenLyrics } from "./FullscreenLyrics";
export class YouTubeLayoutAdapter {
  readonly root = document.createElement("section");
  private observer?: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private fullscreen?: FullscreenLyrics;
  constructor(private changed: () => void) {
    this.root.id = "lyricflow-root";
    this.root.style.cssText =
      "display:block;position:static;width:100%;min-width:0;box-sizing:border-box;margin:0 0 16px;order:-2147483647;flex:none;";
    this.root.attachShadow({ mode: "open" });
  }
  mount() {
    this.fullscreen = new FullscreenLyrics(this.root, () => {
      this.reconcile();
      this.changed();
    });
    this.reconcile();
    const target = document.querySelector("ytd-app") || document.body;
    this.observer = new MutationObserver((records) => {
      if (records.every((r) => this.root.contains(r.target))) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.reconcile();
        this.changed();
      }, 120);
    });
    this.observer.observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["video-id"],
    });
  }
  reconcile() {
    if (this.fullscreen?.reconcile()) return true;
    if (location.pathname !== "/watch") {
      this.root.remove();
      return false;
    }
    const watch = document.querySelector("ytd-watch-flexy");
    const container =
      watch?.querySelector("#secondary") ||
      watch?.querySelector("#secondary-inner");
    if (!container) {
      this.root.remove();
      return false;
    }
    const existing = document.getElementById(this.root.id);
    if (existing && existing !== this.root) existing.remove();
    if (
      this.root.parentElement !== container ||
      container.firstElementChild !== this.root
    )
      container.prepend(this.root);
    return true;
  }
  dispose() {
    this.fullscreen?.dispose();
    this.observer?.disconnect();
    clearTimeout(this.timer);
    this.root.remove();
  }
}
