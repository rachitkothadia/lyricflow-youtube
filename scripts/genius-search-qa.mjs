import "./qa-output.mjs";
import { chromium } from "playwright";
import { build } from "esbuild";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { installNative } from "./install-native.mjs";
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
};
const html = (await readFile("fixtures/watch.html", "utf8")).replace(
  '<script src="/content.js"></script>',
  "",
);
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
const browser = await chromium.launch({
  executablePath: chromium.executablePath(),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.route("http://fixture.test/**", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("http://fixture.test/watch?v=genius001aa");
  await page.evaluate(() => {
    const candidate = {
      id: 99001,
      title: "Paper Sun",
      artist: "Northlight",
      version: "",
      provider: "genius",
      romanized: true,
      url: "https://genius.com/Northlight-paper-sun-lyrics",
    };
    window.queries = [];
    window.selected = [];
    Object.defineProperty(window.chrome, "runtime", {
      configurable: true,
      value: {
        id: "fixture",
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage: async (m) => {
          if (m.type === "TIMING_LOAD") return { profile: null };
          if (m.type === "TIMING_FIND") return { kind: "not-found" };
          if (m.type === "LYRICS_RESOLVE")
            return { kind: "not-found", message: "No matching lyrics found." };
          if (m.type === "GENIUS_SEARCH") {
            window.queries.push(m.query);
            if (m.query === "slow")
              return new Promise((resolve) => {
                window.releaseSearch = () =>
                  resolve({
                    candidates: [{ ...candidate, title: "Obsolete result" }],
                  });
              });
            if (m.query === "empty") return { candidates: [] };
            if (m.query === "blocked")
              return { error: "Genius declined this request." };
            return {
              candidates: [
                candidate,
                {
                  ...candidate,
                  id: 99002,
                  title: "Paper Moon",
                  artist: "Daybreak",
                },
              ],
            };
          }
          if (m.type === "LYRICS_GET") {
            window.selected.push(m.url);
            return {
              kind: "genius-page",
              song: candidate,
              url: candidate.url,
              html: '<meta property="og:title" content="Northlight - Paper Sun Lyrics"><div data-lyrics-container="true">First synthetic line<br>Second synthetic line<br>Third synthetic line</div>',
            };
          }
          return { error: "Unexpected test message" };
        },
      },
    });
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const form = page.locator(".genius-search"),
    input = form.locator("input");
  await page.getByText("No matching lyrics found.", { exact: true }).waitFor();
  check(
    "missing lyrics show Genius search without opening settings",
    await form.isVisible(),
  );
  check(
    "manual query starts with detected song information",
    (await input.inputValue()).includes("Raaste"),
  );
  await input.fill("empty");
  await input.press("Enter");
  await page
    .getByText(
      "No Genius results. Try another spelling, add the artist, or paste a Genius song link.",
      { exact: true },
    )
    .waitFor();
  check(
    "empty Genius results retain an editable query",
    (await input.inputValue()) === "empty",
  );
  await input.fill("blocked");
  await form
    .getByRole("button", { name: "Search Genius", exact: true })
    .click();
  await page
    .getByText("Genius declined this request.", { exact: true })
    .waitFor();
  check(
    "provider failure keeps recovery controls available",
    await input.isEditable(),
  );
  check(
    "search errors preserve keyboard focus",
    await input.evaluate((e) => e.getRootNode().activeElement === e),
  );
  await input.fill("slow");
  await input.press("Enter");
  await page.waitForFunction(() => !!window.releaseSearch);
  await input.fill("unsent draft");
  await page.evaluate(() => window.releaseSearch());
  await page.locator(".candidate").first().waitFor();
  check(
    "search response preserves an unsent query edit",
    (await input.inputValue()) === "unsent draft",
  );
  await input.fill("slow");
  await input.press("Enter");
  await page.waitForFunction(
    () => window.queries.filter((q) => q === "slow").length === 2,
  );
  await input.fill("paper song");
  await input.press("Enter");
  await page.locator(".candidate").first().waitFor();
  await page.evaluate(() => window.releaseSearch());
  check(
    "new query ignores an older search response",
    !(await page.locator(".candidate").allTextContents()).some((t) =>
      t.includes("Obsolete"),
    ),
  );
  check(
    "manual results show song and artist for explicit choice",
    (await page.locator(".candidate").count()) === 2 &&
      (await page.locator(".candidate").first().textContent()).includes(
        "Northlight",
      ),
  );
  await page.setViewportSize({ width: 760, height: 1000 });
  check(
    "search and results fit a narrow sidebar",
    await form.evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  await page.locator(".candidate").first().click();
  await page.locator(".line").first().waitFor();
  check(
    "chosen result loads in the panel despite unrelated detected metadata",
    (await page.locator("#lyricflow-root h2").textContent()) === "Paper Sun" &&
      (await page.locator(".line").count()) === 3,
  );
  check("successful lyrics hide the recovery form", !(await form.isVisible()));
  check(
    "manual selection keeps Genius attribution and no invented timestamps",
    (await page.locator(".source").getAttribute("href")) ===
      "https://genius.com/Northlight-paper-sun-lyrics" &&
      (await page.locator("button.line").count()) === 0,
  );
  await page.evaluate(() => {
    history.pushState({}, "", "/watch?v=genius002bb");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await input.waitFor();
  await input.fill("slow");
  await input.press("Enter");
  await page.waitForFunction(
    () => window.queries.filter((q) => q === "slow").length === 3,
  );
  await page.evaluate(() => {
    history.pushState({}, "", "/watch?v=genius003cc");
    document.querySelector("ytd-watch-metadata h1").textContent =
      "Different Artist - Different Song";
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#lyricflow-root").shadowRoot.querySelector("h2")
        .textContent === "Different Song",
  );
  await page.evaluate(() => window.releaseSearch());
  check(
    "navigation rejects pending search results from the previous video",
    (await page.locator(".candidate").count()) === 0,
  );
} finally {
  await browser.close();
}

const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-genius-search-"));
await installNative(profile);
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
try {
  const page = await context.newPage();
  const blank = html.replace(
    "LyricFlow Test Ensemble - Raaste (Official Audio)",
    "",
  );
  const bytes = await readFile("fixtures/silent.webm");
  await page.route("https://www.youtube.com/**", (r) =>
    r.fulfill(
      r.request().url().endsWith("silent.webm")
        ? { contentType: "video/webm", body: bytes }
        : { contentType: "text/html", body: blank },
    ),
  );
  await page.goto("https://www.youtube.com/watch?v=genius004dd");
  const form = page.locator(".genius-search"),
    input = form.locator("input");
  await input.waitFor();
  check(
    "Genius search is available even without detected song metadata",
    await input.isVisible(),
  );
  await input.fill("Tera Rastaa Chhodoon Na");
  await input.press("Enter");
  await page.waitForFunction(
    () => {
      const s = document.querySelector("#lyricflow-root").shadowRoot;
      return s.querySelector(".candidate") || s.querySelector(".message");
    },
    undefined,
    { timeout: 45000 },
  );
  if (!(await page.locator(".candidate").count()))
    throw new Error(await page.locator(".message").textContent());
  const resultCount = await page.locator(".candidate").count();
  check(
    "actual Genius search returns selectable results for the reported song",
    resultCount > 0,
  );
  await page.locator(".candidate").first().click();
  await page.waitForFunction(
    () => {
      const s = document.querySelector("#lyricflow-root").shadowRoot;
      return s.querySelector(".line") || s.querySelector(".message");
    },
    undefined,
    { timeout: 45000 },
  );
  if (!(await page.locator(".line").count()))
    throw new Error(await page.locator(".message").textContent());
  const source = await page.locator(".source").getAttribute("href"),
    title = await page.locator("#lyricflow-root h2").textContent();
  check(
    "selected live Genius result loads readable lyrics inside the extension",
    (await page.locator(".line").count()) > 4 &&
      new URL(source).hostname === "genius.com",
  );
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  check(
    "manual search and lyric loading work without a Genius API token",
    await worker.evaluate(
      async () => !(await chrome.storage.local.get("geniusToken")).geniusToken,
    ),
  );
  await page.evaluate(() => {
    history.pushState({}, "", "/watch?v=genius005ee");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await input.waitFor();
  await input.fill("https://example.com/song-lyrics");
  await input.press("Enter");
  await page
    .getByText("Use an https://genius.com source link.", { exact: true })
    .waitFor();
  check(
    "foreign pasted URL is rejected with the input retained",
    (await input.inputValue()) === "https://example.com/song-lyrics",
  );
  const sharedSource = source + "?utm_source=" + "x".repeat(250) + "#verse";
  await input.fill(sharedSource);
  assert.equal(await input.inputValue(), sharedSource);
  await input.press("Enter");
  await page.locator(".line").first().waitFor({ timeout: 45000 });
  check(
    "same visible input accepts a long shared Genius URL and recovers from error",
    (await page.locator(".source").getAttribute("href")) === source,
  );
  await page
    .locator("#lyricflow-root")
    .screenshot({ path: "output/reliability/genius-search.png" });
  await writeFile(
    "output/reliability/genius-search.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        live: {
          query: "Tera Rastaa Chhodoon Na",
          resultCount,
          title,
          source,
          lineCount: await page.locator(".line").count(),
        },
        scope:
          "Mocked recovery/navigation cases plus installed MV3 extension on routed YouTube layout with actual Genius search/page/native reader; not live YouTube playback",
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
