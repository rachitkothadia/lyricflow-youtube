import "./qa-output.mjs";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: chromium.executablePath(),
  headless: true,
});
const checks = [];
function check(name, ok) {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
}
const html = (await readFile("fixtures/watch.html", "utf8")).replace(
  '<script src="/content.js"></script>',
  "",
);
const bundle = await readFile("dist/content.js", "utf8");
async function fixture(mode = "ready") {
  const page = await browser.newPage();
  await page.route("http://fixture.test/**", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("http://fixture.test/watch?v=lookup00001");
  await page.evaluate((mode) => {
    window.lookupCalls = 0;
    window.chrome ||= {};
    Object.defineProperty(document.querySelector("video"), "duration", {
      configurable: true,
      get: () => 180,
    });
    if (mode === "missing")
      document.querySelector("yt-formatted-string").textContent = "";
    Object.defineProperty(window.chrome, "runtime", {
      configurable: true,
      value: {
        id: "fixture",
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage: async (m) => {
          if (m.type === "TIMING_LOAD")
            return mode === "storage"
              ? new Promise(() => {})
              : { profile: null };
          if (m.type === "LYRICS_CANCEL") {
            window.cancelledLookup = true;
            return { ok: true };
          }
          window.lookupCalls++;
          if (mode === "stalled") return new Promise(() => {});
          return {
            kind: "ready",
            lyrics: {
              song: {
                title: "Raaste",
                artist: "LyricFlow Test Ensemble",
                version: "",
              },
              sourceUrl: "https://lrclib.net/api/get/99011",
              provenance: "lrclib",
              romanized: true,
              lines: [
                { text: "Synthetic first line", time: 1 },
                { text: "Synthetic second line", time: 5 },
              ],
            },
          };
        },
      },
    });
  }, mode);
  await page.addScriptTag({ content: bundle });
  return page;
}
try {
  const page = await fixture();
  await page.locator(".line").first().waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document.querySelector("video"), "duration", {
      configurable: true,
      get: () => NaN,
    });
    document.querySelector("video").dispatchEvent(new Event("durationchange"));
  });
  await page.waitForTimeout(1600);
  check(
    "temporary duration loss preserves displayed lyrics",
    (await page.locator(".line").count()) === 2,
  );
  check(
    "duration loss does not launch duplicate lookup",
    (await page.evaluate(() => window.lookupCalls)) === 1,
  );
  await Promise.all([
    (async () => {
      const missing = await fixture("missing");
      await missing
        .getByText(
          "Song details are taking too long. Search Genius below, or retry.",
          { exact: true },
        )
        .waitFor();
      check(
        "missing metadata has bounded detection and manual recovery",
        await missing
          .getByLabel("Song, artist or Genius link", { exact: true })
          .isEditable(),
      );
      await missing.evaluate(() => {
        document.querySelector("yt-formatted-string").textContent =
          "LyricFlow Test Ensemble - Raaste";
        document.dispatchEvent(new Event("yt-page-data-updated"));
      });
      await missing.locator(".line").first().waitFor();
      check(
        "late correct metadata still recovers automatically",
        (await missing.locator(".line").count()) === 2,
      );
    })(),
    (async () => {
      const stalled = await fixture("stalled");
      await stalled
        .getByText(
          "Lyrics search took too long. Retry or search Genius below.",
          { exact: true },
        )
        .waitFor();
      check(
        "a hung runtime cannot leave an infinite loading state",
        await stalled
          .getByLabel("Song, artist or Genius link", { exact: true })
          .isEditable(),
      );
      check(
        "expired lookup sends background cancellation",
        await stalled.evaluate(() => window.cancelledLookup),
      );
    })(),
    (async () => {
      const cancel = await fixture("stalled");
      await cancel.evaluate(() => {
        history.pushState({}, "", "/");
        document.dispatchEvent(new Event("yt-navigate-finish"));
      });
      await cancel.waitForFunction(() => window.cancelledLookup);
      check("navigation cancels obsolete background work immediately", true);
    })(),
    (async () => {
      const storage = await fixture("storage");
      await storage.locator(".line").first().waitFor();
      check(
        "stalled timing preferences cannot block readable lyrics",
        (await storage.locator(".line").count()) === 2,
      );
    })(),
  ]);
  await writeFile(
    "output/reliability/lookup.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        scope:
          "Compiled bundle on synthetic layout; source and runtime responses mocked",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
