import "./qa-output.mjs";
import {installNative} from './install-native.mjs';
import { chromium } from "playwright";
import http from "node:http";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const records = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  records.push(name);
  console.log("PASS", name);
};
const server = http.createServer(async (req, res) => {
  const file =
    req.url === "/content.js"
      ? "dist/content.js"
      : req.url === "/silent.webm"
        ? "fixtures/silent.webm"
        : "fixtures/watch.html";
  res.setHeader(
    "Content-Type",
    file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".webm")
        ? "video/webm"
        : "text/html",
  );
  try {
    const bytes = await readFile(file);
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]),
        end = range[2]
          ? Math.min(Number(range[2]), bytes.length - 1)
          : bytes.length - 1;
      res.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": end - start + 1,
      });
      res.end(bytes.subarray(start, end + 1));
    } else {
      res.setHeader("Content-Length", bytes.length);
      res.end(bytes);
    }
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(4174, "127.0.0.1", r));
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-qa-"));
await installNative(profile);
let context;
try {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
  context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1440, height: 1050 },
    args: [
      `--disable-extensions-except=${path.resolve("dist")}`,
      `--load-extension=${path.resolve("dist")}`,
    ],
  });
  context.setDefaultTimeout(12000);
  const page = await context.newPage();
  page.on("pageerror",e=>console.log("PAGEERROR",e.message));
  console.log("browser started");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://lrclib.net/**", route => route.fulfill({contentType:"application/json",body:"[]"}));
  await page.goto("http://127.0.0.1:4174/watch?v=fixture");
  await page
    .getByText("No matching songs", { exact: true })
    .waitFor();
  check("panel once", (await page.locator("#lyricflow-root").count()) === 1);
  check(
    "normal-flow secondary placement",
    await page
      .locator("#lyricflow-root")
      .evaluate(
        (e) =>
          e.parentElement.id === "secondary" &&
          getComputedStyle(e).position === "static",
      ),
  );
  check(
    "recommendations below panel; no player overlap",
    await page.evaluate(() => {
      const p = document
          .querySelector("#lyricflow-root")
          .getBoundingClientRect(),
        r = document.querySelector(".recommendation").getBoundingClientRect(),
        v = document.querySelector("video").getBoundingClientRect();
      return r.top >= p.bottom && p.left >= v.right;
    }),
  );
  await page.getByLabel("Lyrics options", {exact:true}).click();
  await page.getByText("More settings", {exact:true}).click();
  await page.getByRole("button", { name: "Try synthetic demo" }).click();
  await page.evaluate(() => {
    const v = document.querySelector("video");
    v.src = "/silent.webm";
    v.load();
  });
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  await page.waitForFunction(
    () =>
      !!document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".active"),
  );
  const active = () => page.locator("#lyricflow-root .active").innerText();
  check("timestamp zero active", (await active()).includes("Dheere"));
  await page.evaluate(() => {
    const v = document.querySelector("video");
    v.currentTime = 17;
    console.log("seek", v.currentTime, v.duration);
  });
  await page.waitForTimeout(300);
  console.log(
    await page.evaluate(() => ({
      time: document.querySelector("video").currentTime,
      duration: document.querySelector("video").duration,
      paused: document.querySelector("video").paused,
      active: document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelector(".active")?.textContent,
      errors: document.querySelector("video").error?.message,
    })),
  );
  await page.waitForFunction(() =>
    document
      .querySelector("#lyricflow-root")
      .shadowRoot.querySelector(".active")
      ?.textContent?.startsWith("Saath"),
  );
  check("forward seek", (await active()).startsWith("Saath"));
  await page.evaluate(() => (document.querySelector("video").currentTime = 5));
  await page.waitForFunction(() =>
    document
      .querySelector("#lyricflow-root")
      .shadowRoot.querySelector(".active")
      ?.textContent?.startsWith("Khuli"),
  );
  check("backward seek", (await active()).startsWith("Khuli"));
  await page.evaluate(() => {
    const v = document.querySelector("video");
    v.currentTime = 7.7;
    v.playbackRate = 2;
    return v.play();
  });
  await page.waitForFunction(() =>
    document
      .querySelector("#lyricflow-root")
      .shadowRoot.querySelector(".active")
      ?.textContent?.startsWith("Raaste"),
  );
  check(
    "play/resume and playback speed boundary",
    (await active()).startsWith("Raaste"),
  );
  await page.evaluate(() => document.querySelector("video").pause());
  const paused = await active();
  await new Promise((r) => setTimeout(r, 500));
  check("pause does not advance", (await active()) === paused);
  await page.locator(".viewport").dispatchEvent("wheel");
  check(
    "manual scrolling pauses follow",
    await page.getByRole("button", { name: "Resume following" }).isVisible(),
  );
  await page.getByRole("button", { name: "Resume following" }).click();
  check(
    "follow resumes explicitly",
    !(await page.getByRole("button", { name: "Resume following" }).isVisible()),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    "reduced motion disables transition",
    await page
      .locator(".line")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration === "0s"),
  );
  await page.getByText("Sources & settings", { exact: true }).click();
  await page.getByLabel("Timing offset (seconds)").fill("2");
  await page.evaluate(() => (document.querySelector("video").currentTime = 9));
  await page.waitForFunction(() =>
    document
      .querySelector("#lyricflow-root")
      .shadowRoot.querySelector(".active")
      ?.textContent?.startsWith("Khuli"),
  );
  check(
    "positive offset delays highlighting",
    (await active()).startsWith("Khuli"),
  );
  await page.getByText("Sources & settings", { exact: true }).click();
  await page.screenshot({
    path: "output/playwright/dark-timed.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 760, height: 1000 });
  check(
    "narrow viewport no horizontal page overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  check(
    "long line wraps",
    await page
      .locator(".viewport")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  );
  await page.screenshot({
    path: "output/playwright/narrow.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page
    .getByRole("button", { name: "Replace recommendations container" })
    .click();
  await page.waitForTimeout(300);
  check(
    "rerender retains single panel",
    (await page.locator("#lyricflow-root").count()) === 1,
  );
  await page.getByRole("button", { name: "Next video", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#lyricflow-root").shadowRoot.querySelector("h2")
        ?.textContent === "Other Song",
  );
  check(
    "navigation clears old lines",
    (await page.locator(".line").count()) === 0,
  );
  await page.evaluate(() => document.documentElement.removeAttribute("dark"));
  await page.screenshot({
    path: "output/playwright/light-unavailable.png",
    fullPage: true,
  });
  await page.getByLabel("Lyrics options", {exact:true}).click();
  await page.getByRole("button", { name: "Correct song" }).click();
  await page
    .getByLabel("Search lyrics", { exact: true })
    .fill("Other Artist - Other Song");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("No matching songs", { exact: true }).waitFor();
  check(
    "recoverable provider failure",
    await page.getByLabel("Lyrics options", {exact:true}).isVisible(),
  );
  await page.evaluate(() => document.querySelector("#secondary").remove());
  await page.waitForTimeout(300);
  check(
    "missing column removes panel; no overlay",
    (await page.locator("#lyricflow-root").count()) === 0,
  );
  check("no page errors", errors.length === 0);
  // A separate routed YouTube origin verifies MV3 automatic content-script injection, without live network.
  const extension = await context.newPage();
  await extension.route("https://www.youtube.com/**", async (route) => {
    const html = (await readFile("fixtures/watch.html", "utf8")).replace(
      '<script src="/content.js"></script>',
      "",
    );
    await route.fulfill({ contentType: "text/html", body: html });
  });
  await extension.goto("https://www.youtube.com/watch?v=extension-fixture");
  await extension.locator("#lyricflow-root").waitFor();
  check(
    "MV3 extension loaded and injected on matching HTTPS origin",
    (await extension.locator("#lyricflow-root").count()) === 1,
  );
  await writeFile(
    "output/playwright/results.json",
    JSON.stringify(
      {
        date: "2026-10-26",
        mode: "real Chromium; local/routed fixtures, not live YouTube playback",
        passed: records.length,
        checks: records,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: records.length, checks: records }, null, 2),
  );
} finally {
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
