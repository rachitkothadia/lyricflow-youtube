import { Candidate, Lyrics, Song } from "../model";
import { styles } from "./styles";
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  cls?: string,
) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
export type PanelState =
  | "initial"
  | "detecting"
  | "loading"
  | "ready"
  | "unavailable"
  | "ambiguous"
  | "no-results"
  | "error";
const colors = {
  red: "#913447",
  blue: "#214f84",
  green: "#22634f",
  gold: "#80601b",
};
export class LyricsPanel {
  private viewport = el("div", undefined, "viewport");
  private title = el("h2", "Lyrics");
  private status = el("p", undefined, "status");
  private shell = el("section");
  private settings = el("details", undefined, "settings");
  private menu = el("div", undefined, "menu");
  private follow = el("button", "Resume following", "follow");
  private info = el("p", undefined, "provenance");
  private audioMessage = el(
    "p",
    "To identify audio, click the extension toolbar icon. A 10-second tab-audio clip is sent to AudD. No microphone is used.",
    "provenance",
  );
  private lines: HTMLElement[] = [];
  private manual = false;
  private reduced = false;
  private frame = 0;
  private resumeTimer?: ReturnType<typeof setTimeout>;
  private activeIndex = -1;
  private color = "auto";
  private song?: Song;
  private calibrating = false;
  private calibrationButton = el("button", "Match a line to the music");
  private timingMessage = el("p", undefined, "timing-state timing-hint");
  private timingVersions = el("div");
  private geniusQuery = el("input");
  private recovery = el("form", undefined, "genius-search");
  onLanguage = (_language: string) => {};
  onStopAudio = () => {};
  onRetry = () => {};
  onDemo = () => {};
  onImport = (_raw: string) => {};
  onSearch = (_query: string) => {};
  onChoose = (_candidate: Candidate) => {};
  onOffset = (_offset: number) => {};
  onSeek = (_time: number) => {};
  onCalibrate = (_time: number) => {};
  onResetTiming = () => {};
  onVideoTiming = () => {};
  onGenius = (_url: string) => {};
  onGeniusSearch = (_query: string) => {};
  private resizeObserver?: ResizeObserver;
  private outside = (event: PointerEvent) => {
    if (this.settings.open && !event.composedPath().includes(this.settings))
      this.settings.open = false;
  };
  constructor(private shadow: ShadowRoot) {
    const style = el("style");
    style.textContent = styles;
    shadow.replaceChildren(style, this.shell);
    const header = el("header");
    header.append(this.title, this.status);
    this.status.role = "status";
    this.status.setAttribute("aria-live", "polite");
    this.viewport.tabIndex = 0;
    this.viewport.role = "region";
    this.viewport.setAttribute("aria-label", "Lyrics");
    this.follow.type = "button";
    this.follow.hidden = true;
    this.follow.onclick = () => this.resume();
    this.shell.append(header, this.viewport, this.follow, this.settings);
    this.viewport.addEventListener("wheel", () => this.pauseFollowing(), {
      passive: true,
    });
    this.viewport.addEventListener("touchmove", () => this.pauseFollowing(), {
      passive: true,
    });
    this.viewport.addEventListener("keydown", (event) => {
      if (
        event.target instanceof HTMLButtonElement &&
        [" ", "Enter"].includes(event.key)
      )
        return;
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        this.pauseFollowing();
    });
    this.viewport.addEventListener("pointerdown", (event) => {
      if (event.offsetX >= this.viewport.clientWidth) this.pauseFollowing();
    });
    this.shell.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.settings.open = false;
    });
    this.controls();
    this.geniusQuery.type = "search";
    this.geniusQuery.maxLength = 2000;
    this.geniusQuery.placeholder = "Song, artist or Genius URL";
    this.geniusQuery.setAttribute("aria-label", "Song, artist or Genius link");
    const label = el("label", "Find lyrics on Genius");
    label.append(this.geniusQuery);
    const submit = el("button", "Search Genius");
    submit.type = "submit";
    this.recovery.append(label, submit);
    this.recovery.onsubmit = (event) => {
      event.preventDefault();
      this.onGeniusSearch(this.geniusQuery.value);
    };
    document.addEventListener("pointerdown", this.outside);
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.manual) this.scrollActive();
    });
    this.resizeObserver.observe(this.viewport);
  }
  private button(text: string, callback: () => void) {
    const b = el("button", text);
    b.type = "button";
    b.onclick = callback;
    return b;
  }
  private controls() {
    const summary = el("summary", "Sources & settings");
    summary.setAttribute("aria-label", "Lyrics options");
    this.settings.append(summary, this.menu);
    const controls = el("div", undefined, "controls");
    const query = el("input");
    query.type = "text";
    query.maxLength = 200;
    query.placeholder = "Artist - Song";
    controls.append(
      this.button("Retry", () => {
        this.settings.open = false;
        this.onRetry();
      }),
      this.button("Correct song", () => query.focus()),
    );
    const ql = el("label", "Search lyrics");
    ql.append(query);
    const search = this.button("Search", () => {
      this.settings.open = false;
      this.onSearch(query.value);
    });
    const geniusSearch = this.button("Search Genius", () => {
      this.settings.open = false;
      this.onGeniusSearch(query.value);
    });
    query.onkeydown = (e) => {
      if (e.key === "Enter") search.click();
    };
    const palette = el("select");
    palette.setAttribute("aria-label", "Panel color");
    for (const [value, label] of Object.entries({
      auto: "Song color",
      red: "Red",
      blue: "Blue",
      green: "Green",
      gold: "Dark yellow",
    })) {
      const o = el("option", label);
      o.value = value;
      palette.append(o);
    }
    palette.onchange = () => {
      this.color = palette.value;
      this.setColor();
    };
    const language = el("select");
    language.setAttribute("aria-label", "Romanization language");
    for (const [value, label] of [
      ["", "Automatic language"],
      ["ja", "Japanese"],
      ["zh", "Mandarin Chinese"],
      ["ko", "Korean"],
    ]) {
      const o = el("option", label);
      o.value = value;
      language.append(o);
    }
    language.onchange = () => this.onLanguage(language.value);
    const offset = el("input");
    offset.type = "number";
    offset.min = "-10";
    offset.max = "10";
    offset.step = "0.1";
    offset.value = "0.0";
    const ol = el("label", "Timing offset (seconds)");
    offset.id = "lyricflow-offset";
    ol.htmlFor = offset.id;
    const setOffset = (value: number) => {
      const rounded = Math.max(-10, Math.min(10, Math.round(value * 10) / 10));
      offset.value = rounded.toFixed(1);
      this.onOffset(rounded);
    };
    offset.oninput = () => {
      if (Number.isFinite(offset.valueAsNumber)) {
        const value = Math.max(
          -10,
          Math.min(10, Math.round(offset.valueAsNumber * 10) / 10),
        );
        this.onOffset(value);
      }
    };
    offset.onchange = () =>
      setOffset(
        Number.isFinite(offset.valueAsNumber) ? offset.valueAsNumber : 0,
      );
    const stepper = el("div", undefined, "timing-stepper");
    const earlier = this.button("−0.1", () =>
      setOffset(Number(offset.value) - 0.1),
    );
    earlier.setAttribute("aria-label", "Lyrics earlier by 0.1 seconds");
    const later = this.button("+0.1", () =>
      setOffset(Number(offset.value) + 0.1),
    );
    later.setAttribute("aria-label", "Lyrics later by 0.1 seconds");
    stepper.append(
      earlier,
      offset,
      later,
      this.button("Reset", () => {
        this.onResetTiming();
        setOffset(0);
      }),
    );
    this.calibrationButton.type = "button";
    this.calibrationButton.disabled = true;
    this.calibrationButton.onclick = () => {
      this.calibrating = !this.calibrating;
      this.calibrationButton.textContent = this.calibrating
        ? "Cancel alignment"
        : "Match a line to the music";
      this.status.textContent = this.calibrating
        ? "Click the lyric you hear right now"
        : "";
      this.status.hidden = !this.calibrating;
      if (this.calibrating) {
        this.settings.open = false;
        this.manual = true;
        clearTimeout(this.resumeTimer);
        cancelAnimationFrame(this.frame);
        this.follow.hidden = true;
      } else this.resume();
    };
    this.timingMessage.setAttribute("aria-live", "polite");
    const offsetHint = el(
      "p",
      "Positive delays lyrics; negative brings them earlier. Applies to this song.",
      "timing-hint",
    );
    const source = el("input");
    source.type = "url";
    source.placeholder = "https://genius.com/Artist-song-lyrics";
    const sl = el("label", "Genius song link");
    sl.append(source);
    const useSource = this.button("Load Genius lyrics", () => {
      this.settings.open = false;
      this.onGenius(source.value);
    });
    source.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        useSource.click();
      }
    };
    const advanced = el("details");
    advanced.append(el("summary", "More settings"));
    const file = el("input");
    file.type = "file";
    file.accept = ".json,application/json";
    const fl = el("label", "Import authorized Romanized lyrics (.json)");
    fl.append(file);
    file.onchange = () => {
      const f = file.files?.[0];
      if (f) {
        if (f.size > 150000)
          this.state("error", this.song, "File exceeds 150 KB.");
        else void f.text().then((raw) => this.onImport(raw));
      }
      file.value = "";
    };
    const motion = el("input");
    motion.type = "checkbox";
    const ml = el("label", " Minimize motion");
    ml.prepend(motion);
    motion.onchange = () => {
      this.reduced = motion.checked;
      this.shell.classList.toggle("no-motion", this.reduced);
      if (this.reduced) {
        cancelAnimationFrame(this.frame);
        this.scrollActive();
      }
    };
    advanced.append(
      fl,
      ml,
      this.button("Try synthetic demo", () => {
        this.settings.open = false;
        this.onDemo();
      }),
    );
    this.menu.append(
      el("p", "Lyrics options", "menu-title"),
      controls,
      ql,
      search,
      geniusSearch,
      palette,
      language,
      ol,
      stepper,
      offsetHint,
      this.calibrationButton,
      this.timingMessage,
      this.button("Use matching video captions", () => {
        this.settings.open = false;
        this.onVideoTiming();
      }),
      this.timingVersions,
      sl,
      useSource,
      advanced,
      this.info,
      this.audioMessage,
      this.button("Stop audio recognition", () => this.onStopAudio()),
    );
  }
  private setColor() {
    let color = this.color;
    if (color === "auto") {
      const text = (this.song?.artist || "") + (this.song?.title || "");
      let hash = 0;
      for (const c of text) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
      color = Object.keys(colors)[hash % 4];
    }
    (this.shadow.host as HTMLElement).style.setProperty(
      "--bg",
      colors[color as keyof typeof colors] || colors.blue,
    );
  }
  resetOffset() {
    const input =
      this.menu.querySelector<HTMLInputElement>("input[type=number]");
    if (input) input.value = "0.0";
    this.timingMessage.textContent = "";
    this.calibrating = false;
    this.calibrationButton.textContent = "Match a line to the music";
  }
  timingCorrection(base: number, fine: number, replaceInput = false) {
    if (replaceInput) {
      const input =
        this.menu.querySelector<HTMLInputElement>("input[type=number]");
      if (input) input.value = fine.toFixed(1);
    }
    const total = Math.round((base + fine) * 10) / 10;
    this.timingMessage.textContent = total
      ? `Current correction: ${total > 0 ? "+" : ""}${total.toFixed(1)} s${base ? " · aligned to this recording" : ""}`
      : "No timing correction";
  }
  timingError(message: string) {
    this.status.textContent = message;
    this.status.hidden = false;
  }
  setTimingCandidates(candidates: Candidate[]) {
    this.timingVersions.replaceChildren();
    for (const candidate of candidates) {
      const seconds = candidate.duration || 0;
      const label = `Load timed edition${seconds ? ` (${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")})` : ""} · align it to this video`;
      this.timingVersions.append(
        this.button(label, () => {
          this.settings.open = false;
          this.onChoose(candidate);
        }),
      );
    }
  }
  audioStatus(message: string) {
    this.audioMessage.textContent = message;
    this.settings.open = true;
  }
  private pauseFollowing() {
    if (this.calibrating) {
      this.manual = true;
      return;
    }
    if (this.activeIndex < 0) return;
    this.manual = true;
    this.follow.hidden = false;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => this.resume(), 6000);
  }
  private resume() {
    clearTimeout(this.resumeTimer);
    this.manual = false;
    this.follow.hidden = true;
    this.scrollActive();
  }
  state(
    state: PanelState,
    song?: Song,
    message?: string,
    geniusQuery?: string,
  ) {
    const recoveryVisible = this.recovery.isConnected;
    const recoveryFocused = this.recovery.contains(this.shadow.activeElement);
    this.calibrationButton.disabled = true;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.resumeTimer);
    this.activeIndex = -1;
    this.lines = [];
    this.manual = false;
    this.follow.hidden = true;
    delete this.viewport.dataset.timed;
    this.info.replaceChildren();
    this.song = song;
    this.setColor();
    this.title.textContent = song?.title || "Lyrics";
    this.title.title = song ? `${song.title} · ${song.artist}` : "Lyrics";
    const labels: Record<PanelState, string> = {
      initial: "Play a song",
      detecting: "Finding the song…",
      loading: "Finding lyrics…",
      ready: "",
      unavailable: "Lyrics could not load",
      ambiguous: "Choose the recording",
      "no-results": "No matching songs",
      error: "Lyrics could not load",
    };
    this.status.textContent = labels[state];
    this.status.hidden = state === "ready";
    this.viewport.setAttribute(
      "aria-busy",
      String(state === "loading" || state === "detecting"),
    );
    this.viewport.replaceChildren();
    this.viewport.scrollTop = 0;
    if (
      geniusQuery !== undefined ||
      (state === "detecting" && !song) ||
      ["initial", "unavailable", "no-results", "error", "ambiguous"].includes(
        state,
      )
    ) {
      if (geniusQuery === undefined || state === "loading" || !recoveryVisible)
        this.geniusQuery.value =
          geniusQuery ??
          [song?.artist, song?.title].filter(Boolean).join(" - ");
      this.viewport.append(this.recovery);
      if (recoveryFocused) this.geniusQuery.focus({ preventScroll: true });
    }
    if (state === "loading" || state === "detecting") {
      for (let i = 0; i < 4; i++)
        this.viewport.append(el("div", undefined, "skeleton"));
    } else if (message) this.viewport.append(el("p", message, "message"));
  }
  showCandidates(song: Song, candidates: Candidate[], geniusQuery?: string) {
    this.state("ambiguous", song, undefined, geniusQuery);
    if (geniusQuery !== undefined)
      this.status.textContent = "Choose lyrics from Genius";
    for (const c of candidates) {
      const b = this.button(c.title, () => {
        this.settings.open = false;
        this.onChoose(c);
      });
      b.className = "candidate";
      b.append(
        el(
          "small",
          `${c.artist}${c.provider === "genius" ? " · Genius" : ""}${c.duration ? ` · ${Math.round(c.duration)}s` : ""}`,
        ),
      );
      this.viewport.append(b);
    }
  }
  lyrics(data: Lyrics) {
    this.state("ready", data.song);
    const timed = data.lines.every((l) => l.time !== undefined);
    this.calibrating = false;
    this.calibrationButton.textContent = "Match a line to the music";
    this.calibrationButton.disabled = !timed;
    this.setTimingCandidates(data.timingCandidates || []);
    for (const control of this.menu.querySelectorAll<
      HTMLInputElement | HTMLButtonElement
    >(".timing-stepper input,.timing-stepper button")) {
      control.disabled = !timed;
      control.title = timed ? "" : "This source has no line timestamps";
    }
    this.viewport.dataset.timed = String(timed);
    this.info.replaceChildren();
    const label =
      data.provenance === "synthetic"
        ? "Synthetic demo"
        : data.sourceLabel || "Imported lyrics";
    this.status.textContent = timed
      ? "Line timing ready"
      : "No line timing available";
    this.status.hidden = timed;
    this.info.append(
      document.createTextNode(
        `${label} · ${timed ? "Synchronized" : "No line timestamps"}${data.romanization === "generated" ? " · generated Romanization" : ""}`,
      ),
    );
    if (data.timingSource) {
      const a = el("a", `Timing: ${data.timingSource.label}`, "timing-source");
      a.href = data.timingSource.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      this.info.append(a);
    }
    if (data.romanizationSystems?.length)
      this.info.append(el("p", data.romanizationSystems.join(" · ")));
    if (data.provenance !== "synthetic") {
      const a = el("a", `${label} source ↗`, "source");
      a.href = data.sourceUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      this.info.append(a);
    }
    for (const line of data.lines) {
      const p = timed
        ? el("button", line.text, "line")
        : el("p", line.text, "line");
      if (p instanceof HTMLButtonElement) {
        p.type = "button";
        p.title = `Play from ${Math.floor(line.time! / 60)}:${(line.time! % 60).toFixed(1).padStart(4, "0")}`;
        p.onclick = () => {
          this.settings.open = false;
          if (this.calibrating) {
            this.calibrating = false;
            this.calibrationButton.textContent = "Match a line to the music";
            this.status.hidden = true;
            this.onCalibrate(line.time!);
          } else this.onSeek(line.time!);
          this.resume();
        };
      }
      if (line.time !== undefined) p.dataset.time = String(line.time);
      if (line.endTime !== undefined) p.dataset.endTime = String(line.endTime);
      this.lines.push(p);
      this.viewport.append(p);
    }
  }
  active(index: number) {
    this.activeIndex = index;
    this.lines.forEach((line, i) => {
      line.classList.toggle("active", i === index);
      line.classList.toggle("past", index >= 0 && i < index);
      if (i === index) line.setAttribute("aria-current", "true");
      else line.removeAttribute("aria-current");
    });
    if (!this.manual) this.scrollActive();
  }
  private scrollActive() {
    cancelAnimationFrame(this.frame);
    const active = this.lines[this.activeIndex];
    if (!active || this.manual) return;
    const target = () => {
      const box = this.viewport.getBoundingClientRect();
      return Math.max(
        0,
        Math.min(
          this.viewport.scrollHeight - this.viewport.clientHeight,
          this.viewport.scrollTop +
            active.getBoundingClientRect().top -
            box.top -
            this.viewport.clientHeight * 0.34,
        ),
      );
    };
    if (
      this.reduced ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      this.viewport.scrollTop = target();
      return;
    }
    const start = this.viewport.scrollTop,
      started = performance.now();
    const animate = (now: number) => {
      if (this.manual) return;
      const t = Math.min(1, (now - started) / 580);
      this.viewport.scrollTop =
        start + (target() - start) * (1 - Math.pow(1 - t, 4));
      if (t < 1) this.frame = requestAnimationFrame(animate);
    };
    this.frame = requestAnimationFrame(animate);
  }
  dispose() {
    this.resizeObserver?.disconnect();
    document.removeEventListener("pointerdown", this.outside);
    cancelAnimationFrame(this.frame);
    clearTimeout(this.resumeTimer);
    this.shell.remove();
  }
}
