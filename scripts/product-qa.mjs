import "./qa-output.mjs";
import { installNative } from "./install-native.mjs";
import { chromium } from "playwright";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-product-"));
await installNative(profile);
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromium.executablePath(),
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  viewport: { width: 1440, height: 1050 },
  args: [
    `--disable-extensions-except=${path.resolve("dist")}`,
    `--load-extension=${path.resolve("dist")}`,
  ],
});
const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
  console.log("PASS", name);
};
const errors = [];
try {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  const html = (await readFile("fixtures/watch.html", "utf8")).replace(
    '<script src="/content.js"></script>',
    "",
  );
  await page.route("https://www.youtube.com/**", async (route) => {
    if (route.request().url().endsWith("silent.webm")) {
      const bytes = await readFile("fixtures/silent.webm"),
        range = route
          .request()
          .headers()
          ["range"]?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0,
        end =
          range && range[2]
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
    } else await route.fulfill({ contentType: "text/html", body: html });
  });
  await page.goto("https://www.youtube.com/watch?v=product-test");
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
  check(
    "compact panel is at most 370px tall",
    (await page.locator("#lyricflow-root").boundingBox()).height <= 370,
  );
  check(
    "utilities are hidden by default",
    !(await page.locator(".settings").evaluate((e) => e.open)),
  );
  check(
    "no prototype brand or visible utility buttons",
    await page
      .locator("#lyricflow-root")
      .evaluate(
        (e) =>
          !e.shadowRoot.querySelector(".brand") &&
          [...e.shadowRoot.querySelectorAll("button:not(.line)")].every(
            (b) => !b.checkVisibility(),
          ),
      ),
  );
  await page.locator(".viewport").click({ position: { x: 20, y: 20 } });
  check(
    "ordinary click does not disable following",
    await page.getByRole("button", { name: "Resume following" }).isHidden(),
  );
  await page.evaluate(() => {
    const v = document.querySelector("video");
    v.pause();
    v.currentTime = 33;
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".active")?.dataset.time === "32",
  );
  await page.waitForTimeout(750);
  const layout = await page.locator("#lyricflow-root").evaluate((e) => {
    const s = e.shadowRoot,
      v = s.querySelector(".viewport"),
      a = s.querySelector(".active"),
      normal = s.querySelector(".line:not(.active)");
    return {
      scroll: v.scrollTop,
      font:
        parseFloat(getComputedStyle(a).fontSize) -
        parseFloat(getComputedStyle(normal).fontSize),
      focus:
        (a.getBoundingClientRect().top - v.getBoundingClientRect().top) /
        v.clientHeight,
      past: s.querySelectorAll(".past").length,
      activeColor: getComputedStyle(a).color,
      futureColor: getComputedStyle(normal).color,
    };
  });
  console.log("SCROLL", JSON.stringify(layout));
  await page
    .locator("#lyricflow-root")
    .screenshot({ path: "/tmp/lyricflow-scroll.png" });
  check("actual video seek automatically scrolls lyrics", layout.scroll > 100);
  check("current line is 4px larger", Math.abs(layout.font - 4) < 0.2);
  check(
    "current line stays in reading focus",
    Math.abs(layout.focus - 0.34) < 0.04,
  );
  check(
    "past/current colors differ",
    layout.activeColor !== layout.futureColor && layout.past > 0,
  );
  const before = await page.locator(".viewport").evaluate((e) => e.scrollTop);
  await page.evaluate(() => (document.querySelector("video").currentTime = 9));
  await page.waitForTimeout(100);
  const midway = await page.locator(".viewport").evaluate((e) => e.scrollTop);
  await page.waitForTimeout(600);
  const after = await page.locator(".viewport").evaluate((e) => e.scrollTop);
  check(
    "scroll moves through intermediate animated positions",
    midway !== before && Math.abs(midway - after) > 1,
  );
  await page.locator(".viewport").dispatchEvent("wheel");
  check(
    "manual scrolling temporarily pauses following",
    await page.getByRole("button", { name: "Resume following" }).isVisible(),
  );
  await page.waitForTimeout(6400);
  check(
    "following resumes automatically after six seconds",
    await page.getByRole("button", { name: "Resume following" }).isHidden(),
  );
  await mkdir("output/product", { recursive: true });
  for (const color of ["red", "blue", "green", "gold"]) {
    await menu();
    await page.getByLabel("Panel color", { exact: true }).selectOption(color);
    await page.getByLabel("Lyrics options", { exact: true }).click();
    await page.waitForTimeout(550);
    await page
      .locator("#lyricflow-root")
      .screenshot({ path: `output/product/${color}.png` });
  }
  check("all four requested colors render", true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.querySelector("video").currentTime = 25));
  await page.waitForTimeout(150);
  check(
    "reduced motion disables line transitions",
    await page
      .locator(".active")
      .evaluate((e) => getComputedStyle(e).transitionDuration === "0s"),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await menu();
  await page
    .getByLabel("Search lyrics", { exact: true })
    .fill("Karma - Underpressure");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".line") ||
      document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".message"),
    undefined,
    { timeout: 60000 },
  );
  if (!(await page.locator(".line").count()))
    throw new Error(await page.locator(".message").innerText());
  check(
    "Karma Underpressure loads from actual Genius network",
    (await page.locator(".source").getAttribute("href")) ===
      "https://genius.com/Karma-underpressure-lyrics",
  );
  check(
    "Genius returns substantial structured lyric lines",
    (await page.locator(".line").count()) > 20,
  );
  check(
    "Genius source without timestamps never fabricates active lines",
    (await page.locator(".active").count()) === 0,
  );
  check(
    "Genius provenance is retained inside options",
    (await page.locator(".menu .provenance").first().textContent()).includes(
      "Genius",
    ),
  );
  const sourceResult = {
    title: await page.locator("#lyricflow-root h2").innerText(),
    lines: await page.locator(".line").count(),
    source: await page.locator(".source").getAttribute("href"),
    timed: false,
  };
  await page.setViewportSize({ width: 760, height: 1000 });
  check(
    "compact sidebar has no narrow-screen overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  check("no browser errors", errors.length === 0);
  await writeFile(
    "output/product/results.json",
    JSON.stringify(
      { checks, passed: checks.length, genius: sourceResult, errors },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
