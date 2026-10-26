/** Keeps the existing panel inside the browser's fullscreen element. */
export class FullscreenLyrics {
  private target?: HTMLElement;
  private player?: HTMLElement;
  private sheet = document.createElement("style");
  private divider = document.createElement("div");
  private toggle = document.createElement("button");
  private width = 0;
  private collapsed = false;
  private dragging = false;
  private refresh = () => this.changed();
  constructor(private root: HTMLElement, private changed: () => void) {
    this.divider.className = "fullscreen-divider";
    this.divider.role = "separator";
    this.divider.tabIndex = 0;
    this.divider.setAttribute("aria-orientation", "vertical");
    this.divider.setAttribute("aria-label", "Resize lyrics panel");
    this.divider.title = "Drag left for more lyrics space; use Left and Right arrow keys";
    this.toggle.className = "fullscreen-toggle";
    this.toggle.type = "button";
    this.toggle.onclick = () => { this.collapsed = !this.collapsed; this.size(); };
    this.divider.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.dragging = true;
      this.divider.setPointerCapture(event.pointerId);
    };
    this.divider.onpointermove = (event) => {
      if (!this.dragging || !this.target) return;
      this.width = this.target.getBoundingClientRect().right - event.clientX - 16;
      this.size();
    };
    this.divider.onpointerup = this.divider.onpointercancel = this.divider.onlostpointercapture = () => { this.dragging = false; };
    this.divider.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const [min, max] = this.bounds();
      this.width = event.key === "Home" ? min : event.key === "End" ? max : this.width + (event.key === "ArrowLeft" ? 32 : -32);
      this.size();
    };
    // Player click/keyboard shortcuts must not consume panel interactions.
    for (const type of ["click", "dblclick", "pointerdown", "keydown"])
      root.addEventListener(type, this.isolate);
    root.shadowRoot!.append(this.divider, this.toggle);
    this.sheet.textContent = `
      [data-lyricflow-player=nested] {width:calc(100% - var(--lyricflow-pane-width))!important;height:100%!important;left:0!important;top:0!important;right:auto!important;--lyricflow-video-width:100%}
      [data-lyricflow-player=root] {--lyricflow-video-width:calc(100% - var(--lyricflow-pane-width))}
      [data-lyricflow-player] .html5-video-container {position:absolute!important;left:0!important;top:0!important;width:var(--lyricflow-video-width)!important;height:100%!important}
      [data-lyricflow-player] .html5-video-container > video {width:100%!important;height:100%!important;left:0!important;top:0!important;object-fit:contain!important}
      [data-lyricflow-fullscreen] > video {width:calc(100% - var(--lyricflow-pane-width))!important;height:100%!important;left:0!important;top:0!important;object-fit:contain!important}
      [data-lyricflow-player] .ytp-chrome-bottom {width:calc(var(--lyricflow-video-width) - 24px)!important;right:auto!important}
      [data-lyricflow-player=root] .ytp-chrome-top {right:var(--lyricflow-pane-width)!important}
      [data-lyricflow-player=nested] .ytp-chrome-top {right:0!important}
      [data-lyricflow-player] .ytp-gradient-bottom,[data-lyricflow-player] .ytp-gradient-top {width:var(--lyricflow-video-width)!important}
    `;
    document.addEventListener("fullscreenchange", this.refresh);
    window.addEventListener("resize", this.refresh);
  }
  private isolate = (event: Event) => {
    if (this.target && !(event instanceof KeyboardEvent && event.key === "Escape")) event.stopPropagation();
  };
  private bounds() {
    const available = this.target?.clientWidth || innerWidth;
    const max = Math.max(140, Math.min(available * .65, available - 272));
    return [Math.min(240, max), max];
  }
  private size() {
    if (!this.target) return;
    const [min, max] = this.bounds();
    this.width = Math.round(Math.min(max, Math.max(min, this.width || this.target.clientWidth * .3)));
    this.root.style.setProperty("--lyrics-width", `${this.width}px`);
    this.target.style.setProperty("--lyricflow-pane-width", `${this.collapsed ? 0 : this.width + 32}px`);
    this.root.toggleAttribute("collapsed", this.collapsed);
    this.divider.setAttribute("aria-valuemin", String(Math.round(min)));
    this.divider.setAttribute("aria-valuemax", String(Math.round(max)));
    this.divider.setAttribute("aria-valuenow", String(this.width));
    this.toggle.textContent = this.collapsed ? "Lyrics" : "×";
    this.toggle.setAttribute("aria-label", this.collapsed ? "Show lyrics" : "Hide lyrics");
    this.toggle.setAttribute("aria-expanded", String(!this.collapsed));
  }
  reconcile(): boolean {
    const fullscreen = document.fullscreenElement;
    const video = document.querySelector("ytd-watch-flexy video");
    const target = location.pathname === "/watch" && fullscreen instanceof HTMLElement && fullscreen !== video && video && fullscreen.contains(video) ? fullscreen : undefined;
    if (target !== this.target) {
      this.clear();
      this.target = target;
      if (target) {
        target.setAttribute("data-lyricflow-fullscreen", "");
        target.append(this.sheet);
        this.root.setAttribute("fullscreen", "");
      }
    }
    if (!this.target) return false;
    const player = video?.closest<HTMLElement>(".html5-video-player,#movie_player");
    const activePlayer = player && this.target.contains(player) ? player : undefined;
    if (activePlayer !== this.player) {
      this.player?.removeAttribute("data-lyricflow-player");
      this.player = activePlayer;
      this.player?.setAttribute("data-lyricflow-player", this.player === this.target ? "root" : "nested");
    }
    if (this.root.parentElement !== this.target) this.target.append(this.root);
    this.size();
    return true;
  }
  private clear() {
    this.dragging = false;
    this.target?.removeAttribute("data-lyricflow-fullscreen");
    this.player?.removeAttribute("data-lyricflow-player");
    this.player = undefined;
    this.target?.style.removeProperty("--lyricflow-pane-width");
    this.sheet.remove();
    this.root.removeAttribute("fullscreen");
    this.root.removeAttribute("collapsed");
    this.target = undefined;
  }
  dispose() {
    document.removeEventListener("fullscreenchange", this.refresh);
    window.removeEventListener("resize", this.refresh);
    for (const type of ["click", "dblclick", "pointerdown", "keydown"]) this.root.removeEventListener(type, this.isolate);
    this.clear();
    this.divider.remove();
    this.toggle.remove();
  }
}
