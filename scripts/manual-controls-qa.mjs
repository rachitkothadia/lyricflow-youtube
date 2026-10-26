import "./qa-output.mjs";
import { chromium } from "playwright";
import { installNative } from "./install-native.mjs";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-controls-"));
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
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
};
try {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const html = (await readFile("fixtures/watch.html", "utf8")).replace(
    '<script src="/content.js"></script>',
    "",
  );
  await page.route("https://www.youtube.com/**", async (route) => {
    if (!route.request().url().endsWith("silent.webm"))
      return route.fulfill({ contentType: "text/html", body: html });
    const bytes = await readFile("fixtures/silent.webm"),
      range = route
        .request()
        .headers()
        .range?.match(/^bytes=(\d+)-(\d*)$/),
      start = range ? Number(range[1]) : 0,
      end = range?.[2]
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
  });
  await page.goto("https://www.youtube.com/watch?v=controls-test");
  await page.locator("#lyricflow-root").waitFor();
  const menu = async () => {
    if (!(await page.locator(".settings").evaluate((e) => e.open)))
      await page.getByLabel("Lyrics options", { exact: true }).click();
  };
  await menu();
  await page.getByText("More settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Try synthetic demo", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  await menu();
  const offset = page.getByLabel("Timing offset (seconds)", { exact: true });
  const type = async (value) => {
    await offset.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(value, { delay: 25 });
  };
  await type("-0.1");
  check(
    "negative decimal can be typed character by character",
    (await offset.inputValue()) === "-0.1",
  );
  await offset.blur();
  await type("2.3");
  check(
    "positive decimal can be typed without caret resets",
    (await offset.inputValue()) === "2.3",
  );
  await offset.blur();
  await page.getByLabel("Lyrics options", { exact: true }).click();
  await page.locator("button.line").nth(4).click();
  await page.waitForFunction(() => !document.querySelector("video").seeking);
  await page.evaluate(() => document.querySelector("video").pause());
  check(
    "typed delay changes the actual video seek target",
    Math.abs(
      (await page.locator("video").evaluate((e) => e.currentTime)) - 18.3,
    ) < 0.5,
  );
  await menu();
  await type("-1.2");
  await offset.blur();
  await page.getByLabel("Lyrics options", { exact: true }).click();
  await page.locator("button.line").nth(4).click();
  await page.waitForFunction(() => !document.querySelector("video").seeking);
  await page.evaluate(() => document.querySelector("video").pause());
  check(
    "typed negative delay changes the actual video seek target",
    Math.abs(
      (await page.locator("video").evaluate((e) => e.currentTime)) - 14.8,
    ) < 0.5,
  );
  await menu();
  await type("11");
  await offset.blur();
  check("typed delay clamps on commit", (await offset.inputValue()) === "10.0");
  const url = page.getByLabel("Genius song link", { exact: true });
  await url.fill(
    "https://www.genius.com/Seedhe-maut-and-kr-na-buzz-lyrics/?utm_source=share#verse",
  );
  await url.press("Enter");
  await page.waitForFunction(
    () => {
      const s = document.querySelector("#lyricflow-root").shadowRoot;
      return (
        s.querySelector("h2").textContent === "Buzz" &&
        s.querySelectorAll(".line").length > 20
      );
    },
    undefined,
    { timeout: 45000 },
  );
  check(
    "Enter loads a shared Genius URL despite different detected metadata",
    (await page.locator(".line").count()) > 20,
  );
  check(
    "manual source uses its canonical title",
    (await page.locator("#lyricflow-root h2").textContent()) === "Buzz",
  );
  check(
    "manual source strips tracking and www",
    (await page.locator(".source").getAttribute("href")) ===
      "https://genius.com/Seedhe-maut-and-kr-na-buzz-lyrics",
  );
  check(
    "untimed manual source has a visible timing notice",
    (await page.getByRole("status").isVisible()) &&
      (await page.getByRole("status").textContent()).includes("No line timing"),
  );
  check(
    "untimed source does not invent seek targets",
    (await page.locator("button.line").count()) === 0,
  );
  await menu();
  check(
    "delay is explicitly disabled for untimed source",
    await offset.isDisabled(),
  );
  await page.evaluate(() => {
    history.pushState({}, "", "/watch?v=no-metadata");
    document.querySelector("ytd-watch-metadata h1").textContent = "";
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#lyricflow-root").shadowRoot.querySelector("h2")
        .textContent === "Lyrics",
  );
  await menu();
  await url.press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector("#lyricflow-root").shadowRoot.querySelector("h2")
        .textContent === "Buzz",
    undefined,
    { timeout: 45000 },
  );
  check(
    "manual Genius link works before automatic song detection",
    (await page.locator(".line").count()) > 20,
  );
  const result = {
    passed: checks.length,
    scope:
      "Installed extension, actual keyboard input and video playback on routed fixture, real Genius reader/network for shared URL",
    checks,
  };
  await mkdir("output/reliability", { recursive: true });
  await writeFile(
    "output/reliability/manual-controls.json",
    JSON.stringify(result, null, 2),
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
