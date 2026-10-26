import "./qa-output.mjs";
import { chromium } from "playwright";
import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
};
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-sync-"));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromium.executablePath(),
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  viewport: { width: 1440, height: 1000 },
  args: [
    `--disable-extensions-except=${path.resolve("dist")}`,
    `--load-extension=${path.resolve("dist")}`,
  ],
});
const html = (await readFile("fixtures/watch.html", "utf8"))
  .replace('<script src="/content.js"></script>', "")
  .replace("LyricFlow Test Ensemble - Raaste (Official Audio)", "");
const bytes = await readFile("fixtures/silent.webm");
const routeFixture = async (route) => {
  if (!route.request().url().endsWith("silent.webm"))
    return route.fulfill({ contentType: "text/html", body: html });
  const range = route
      .request()
      .headers()
      .range?.match(/^bytes=(\d+)-(\d*)$/),
    start = range ? Number(range[1]) : 0;
  const end = range?.[2]
    ? Math.min(Number(range[2]), bytes.length - 1)
    : bytes.length - 1;
  await route.fulfill({
    status: range ? 206 : 200,
    contentType: "video/webm",
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(range
        ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` }
        : {}),
    },
    body: bytes.subarray(start, end + 1),
  });
};
const data = {
  song: { title: "Timing Test", artist: "Northlight", version: "" },
  sourceUrl: "https://genius.com/Northlight-timing-test-lyrics",
  provenance: "user-confirmed",
  romanized: true,
  lines: [8, 12, 16, 20].map((time, i) => ({
    text: `Synthetic lyric ${i + 1}`,
    time,
  })),
};
try {
  await context.route("https://www.youtube.com/**", routeFixture);
  const page = await context.newPage();
  const menu = async () => {
    if (!(await page.locator(".settings").evaluate((e) => e.open)))
      await page.getByLabel("Lyrics options", { exact: true }).click();
  };
  const load = async (id = "timings001a", payload = data) => {
    await page.goto("https://www.youtube.com/watch?v=" + id);
    await page.locator("#lyricflow-root").waitFor();
    await page.waitForFunction(
      () => document.querySelector("video").readyState >= 2,
    );
    await menu();
    await page.getByText("More settings", { exact: true }).click();
    await page
      .getByRole("button", { name: "Try synthetic demo", exact: true })
      .click();
    await menu();
    await page
      .locator("input[type=file]")
      .setInputFiles({
        name: "synthetic.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(payload)),
      });
    await page.waitForFunction(
      () =>
        document.querySelector("#lyricflow-root").shadowRoot.querySelector("h2")
          .textContent === "Timing Test",
    );
  };
  const pauseAt = async (time) => {
    await page.locator("video").evaluate((v, t) => {
      v.pause();
      v.currentTime = t;
    }, time);
    await page.waitForFunction(() => !document.querySelector("video").seeking);
  };
  const active = async (time) => {
    await page.waitForFunction(
      (t) =>
        document
          .querySelector("#lyricflow-root")
          .shadowRoot.querySelector(".line.active")?.dataset.time === String(t),
      time,
    );
  };
  const offset = page.getByLabel("Timing offset (seconds)", { exact: true });
  await load();
  await pauseAt(14);
  await active(12);
  await menu();
  await offset.fill("3");
  await offset.blur();
  await active(8);
  check("positive delay updates paused highlight immediately", true);
  await offset.fill("-3");
  await offset.blur();
  await active(16);
  check("negative delay updates paused highlight immediately", true);
  await page.locator("video").evaluate((v) => v.play());
  await offset.fill("3");
  await offset.blur();
  await active(8);
  check(
    "delay updates playing highlight without seeking",
    (await page.locator("video").evaluate((v) => v.currentTime)) > 14,
  );
  await pauseAt(28);
  await page
    .getByRole("button", { name: "Match a line to the music", exact: true })
    .click();
  await page.locator("button.line").nth(0).click();
  await active(8);
  check(
    "aligning a line applies a 20-second recording offset without seeking",
    Math.abs(
      (await page.locator("video").evaluate((v) => v.currentTime)) - 28,
    ) < 0.01,
  );
  await menu();
  await offset.fill("0.3");
  await offset.blur();
  await pauseAt(33);
  await active(12);
  await page.getByLabel("Lyrics options", { exact: true }).click();
  await page.locator("button.line").nth(1).click();
  await page.waitForFunction(() => !document.querySelector("video").seeking);
  await page.locator("video").evaluate((v) => v.pause());
  check(
    "lyric seeking includes both recording alignment and fine delay",
    Math.abs(
      (await page.locator("video").evaluate((v) => v.currentTime)) - 32.3,
    ) < 0.5,
  );
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const profiles = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get("timingCorrections")).timingCorrections,
  );
  check(
    "real extension background saves correction locally",
    Object.values(profiles).some((p) => p.base === 20 && p.fine === 0.3),
  );
  await load();
  await menu();
  check(
    "same recording restores fine delay after reload",
    (await offset.inputValue()) === "0.3",
  );
  check(
    "same recording restores line alignment",
    (await page.locator(".timing-state").textContent()).includes("+20.3"),
  );
  await load("timings002b");
  await menu();
  check(
    "correction does not leak into another YouTube recording",
    (await offset.inputValue()) === "0.0" &&
      !(await page.locator(".timing-state").textContent()).includes("20.3"),
  );
  await load("timings001a", {
    ...data,
    lines: data.lines.map((l) => ({ ...l, time: l.time + 1 })),
  });
  await menu();
  check(
    "changed source timestamps do not reuse stale correction",
    (await offset.inputValue()) === "0.0",
  );
  await load();
  await menu();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await load();
  await menu();
  check(
    "Reset removes saved base and fine correction",
    (await offset.inputValue()) === "0.0" &&
      (await page.locator(".timing-state").textContent()) ===
        "No timing correction",
  );
  await page.close();

  const bundle = await build({
    alias: { path: path.resolve("src/lyrics/browserPath.ts") },
    stdin: {
      contents: "import {start} from './src/content';window.app=start();",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
    target: "chrome120",
  });
  const plainContext = await context.browser().newContext();
  const clock = await plainContext.newPage();
  await clock.route("http://fixture.test/**", routeFixture);
  await clock.goto("http://fixture.test/watch?v=timings003c");
  await clock.evaluate(() => {
    const v = document.querySelector("video"),
      player = document.createElement("div");
    player.id = "movie_player";
    player.className = "html5-video-player";
    v.before(player);
    player.append(v);
    v.classList.add("html5-main-video");
    const preview = document.createElement("video");
    document.body.prepend(preview);
    Object.defineProperty(preview, "duration", { value: 999 });
    document.querySelector("ytd-watch-metadata h1").textContent =
      "Northlight - Paper Sun";
    document.querySelector("#channel-name a").textContent = "Northlight";
    window.testDuration = NaN;
    Object.defineProperty(v, "duration", {
      configurable: true,
      get: () => window.testDuration,
    });
    window.lookups = [];
    window.pendingProfile = false;
    Object.defineProperty(window.chrome, "runtime", {
      configurable: true,
      value: {
        id: "fixture",
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage: async (message) => {
          if (message.type === "TIMING_LOAD")
            return window.pendingProfile
              ? new Promise((r) => {
                  window.releaseProfile = r;
                })
              : { profile: null };
          if (message.type === "TIMING_SAVE") return { ok: true };
          window.lookups.push(message.song.duration);
          return {
            kind: "ready",
            lyrics: {
              song: message.song,
              sourceUrl: "https://lrclib.net/api/get/990003",
              provenance: "lrclib",
              romanized: true,
              lines: [2, 8, 12].map((time, i) => ({
                text: `Synthetic ${i}`,
                time,
              })),
            },
          };
        },
      },
    });
  });
  await clock.addScriptTag({ content: bundle.outputFiles[0].text });
  await clock.waitForTimeout(300);
  check(
    "lookup waits for media metadata instead of using preview duration",
    (await clock.evaluate(() => window.lookups.length)) === 0,
  );
  const duration = async (value) =>
    clock.evaluate((value) => {
      window.testDuration = value;
      document
        .querySelector("#movie_player video")
        .dispatchEvent(new Event("durationchange"));
    }, value);
  await duration(270);
  await clock.waitForFunction(() => window.lookups.includes(270));
  await clock.locator("button.line").first().waitFor();
  await duration(285);
  await clock.waitForFunction(() => window.lookups.includes(285));
  check("new recording duration triggers a fresh edition lookup", true);
  const n = await clock.evaluate(() => window.lookups.length);
  await duration(285.05);
  await clock.waitForTimeout(300);
  check(
    "small duration rounding does not repeatedly reload lyrics",
    (await clock.evaluate(() => window.lookups.length)) === n,
  );
  await clock.evaluate(() => {
    const v = document.querySelector("#movie_player video");
    v.pause();
    v.currentTime = 9;
  });
  await clock.waitForFunction(
    () =>
      document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".line.active")?.dataset.time === "8",
  );
  await clock.evaluate(() =>
    document.querySelector("#movie_player").classList.add("ad-showing"),
  );
  await duration(30);
  await clock.waitForFunction(
    () =>
      !document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".line.active"),
  );
  await clock.locator("button.line").first().click();
  check(
    "advertisement hides highlight and disables lyric seeking",
    Math.abs(
      (await clock
        .locator("#movie_player video")
        .evaluate((v) => v.currentTime)) - 9,
    ) < 0.01,
  );
  check(
    "advertisement duration never selects a song edition",
    !(await clock.evaluate(() => window.lookups)).includes(30),
  );
  await duration(285);
  await clock.evaluate(() =>
    document.querySelector("#movie_player").classList.remove("ad-showing"),
  );
  await clock.waitForFunction(
    () =>
      !!document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".line.active"),
  );
  check("paused song highlight resumes when advertisement ends", true);
  let mismatch = false;
  await clock.route("http://fixture.test/api/timedtext?**", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        events: [3, 9, 13].map((time, i) => ({
          tStartMs: time * 1000,
          segs: [{ utf8: mismatch ? `Other ${i}` : `Synthetic ${i}` }],
        })),
      }),
    }),
  );
  await clock.evaluate(() =>
    fetch("/api/timedtext?v=timings003c").then((r) => r.text()),
  );
  const clockMenu = async () => {
    if (!(await clock.locator(".settings").evaluate((e) => e.open)))
      await clock.getByLabel("Lyrics options", { exact: true }).click();
  };
  await clockMenu();
  await clock
    .getByRole("button", { name: "Use matching video captions", exact: true })
    .click();
  await clock.waitForFunction(
    () =>
      document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".line")?.dataset.time === "3",
  );
  check(
    "matching captions transfer only their actual line timestamps",
    JSON.stringify(
      await clock
        .locator(".line")
        .evaluateAll((lines) => lines.map((l) => Number(l.dataset.time))),
    ) === "[3,9,13]",
  );
  await clockMenu();
  check(
    "caption timing retains original lyric source and text",
    (await clock.locator(".source").getAttribute("href")) ===
      "https://lrclib.net/api/get/990003" &&
      (await clock.locator(".timing-source").getAttribute("href")) ===
        "https://www.youtube.com/watch?v=timings003c" &&
      (await clock.locator(".line").first().textContent()) === "Synthetic 0",
  );
  mismatch = true;
  await clock
    .getByRole("button", { name: "Use matching video captions", exact: true })
    .click();
  await clock.getByRole("status").filter({ hasText: "do not match" }).waitFor();
  check(
    "mismatching captions leave existing timing intact",
    (await clock.locator(".line").first().getAttribute("data-time")) === "3",
  );
  await clock.evaluate(() => {
    history.pushState({}, "", "/watch?v=timings004d");
    document.dispatchEvent(new Event("yt-navigate-finish"));
    const b = document.createElement("button");
    b.className = "ytp-subtitles-button";
    b.setAttribute("aria-pressed", "false");
    b.onclick = () =>
      b.setAttribute(
        "aria-pressed",
        String(b.getAttribute("aria-pressed") !== "true"),
      );
    document.body.append(b);
  });
  await clock.locator("button.line").first().waitFor();
  await clockMenu();
  await clock
    .getByRole("button", { name: "Use matching video captions", exact: true })
    .click();
  await clock.waitForFunction(
    () =>
      document
        .querySelector(".ytp-subtitles-button")
        .getAttribute("aria-pressed") === "true",
  );
  await clock.evaluate(() => {
    history.pushState({}, "", "/watch?v=timings005e");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await clock.waitForFunction(
    () =>
      document
        .querySelector(".ytp-subtitles-button")
        .getAttribute("aria-pressed") === "false",
  );
  check("navigation cancels caption recovery and restores caption state", true);
  await clock.evaluate(() => {
    window.pendingProfile = true;
    window.releaseProfile = null;
  });
  await duration(300);
  await clock.waitForFunction(() => !!window.releaseProfile);
  await clock.evaluate(() => {
    window.pendingProfile = false;
    history.pushState({}, "", "/watch?v=timings006f");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await clock.locator("button.line").first().waitFor();
  await clock.evaluate(() =>
    window.releaseProfile({ profile: { base: 99, fine: 9 } }),
  );
  await clockMenu();
  check(
    "late saved correction cannot overwrite the next video",
    (await clock
      .getByLabel("Timing offset (seconds)", { exact: true })
      .inputValue()) === "0.0",
  );
  await clock.evaluate(() => window.app.dispose());
  await plainContext.close();
  await writeFile(
    "output/reliability/sync.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        scope:
          "Installed extension on synthetic media; isolated recording-duration and advertisement events",
      },
      null,
      2,
    ),
  );
  console.log(`${checks.length} sync checks passed`);
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
