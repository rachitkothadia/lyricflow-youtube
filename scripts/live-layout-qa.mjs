import {installNative} from './install-native.mjs';
import { chromium } from "playwright";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-live-"));
await installNative(profile);
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath(),
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1440, height: 1050 },
    args: [
      `--disable-extensions-except=${path.resolve("dist")}`,
      `--load-extension=${path.resolve("dist")}`,
    ],
  });
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/watch?v=xEeFrLSkMm8", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.locator("#lyricflow-root").waitFor({ timeout: 20000 });
  await page.waitForTimeout(12000);
  if (await page.locator("#lyricflow-root .candidate").count()) await page.locator("#lyricflow-root .candidate").first().click();
  await page.locator("#lyricflow-root .line").first().waitFor({timeout:30000});
  const seekTarget = await page.locator("#lyricflow-root .line").nth(3).getAttribute("data-time");
  await page.evaluate(time => { const v=document.querySelector("video");v.pause();v.currentTime=Number(time)+.1; }, seekTarget);
  await page.waitForFunction(() => {const s=document.querySelector("#lyricflow-root").shadowRoot;return [...s.querySelectorAll(".line")].findIndex(e=>e.classList.contains("active"))===3;},{timeout:15000});
  const result = await page.locator("#lyricflow-root").evaluate((e) => {
    const p = e.getBoundingClientRect(),
      video = document.querySelector("video")?.getBoundingClientRect(),
      related = document.querySelector("#related")?.getBoundingClientRect();
    return {
      liveSeekVerified: true,
      url: location.href,
      raw: document.querySelector("ytd-watch-metadata h1")?.textContent,
      lines:e.shadowRoot.querySelectorAll(".line").length,
      candidates:e.shadowRoot.querySelectorAll(".candidate").length,
      parent: e.parentElement.id,
      width: p.width,
      position: getComputedStyle(e).position,
      rootCount: document.querySelectorAll("#lyricflow-root").length,
      hasShadow: !!e.shadowRoot,
      status: e.shadowRoot.querySelector("[role=status]")?.textContent,
      title: e.shadowRoot.querySelector("h2")?.textContent,
      videoNoOverlap: video
        ? p.left >= video.right || p.top >= video.bottom
        : null,
      recommendationsBelow: related ? related.top >= p.bottom : null,
    };
  });
  await page.screenshot({
    path: "output/playwright/live-youtube-layout.png",
    fullPage: false,
  });
  await writeFile(
    "output/playwright/live-layout.json",
    JSON.stringify(
      {
        date: "2026-10-26",
        scope:
          "Installed MV3 on real YouTube: automatic metadata, real LRCLIB lyrics, local Romanization and actual video seek/highlight",
        ...result,
      },
      null,
      2,
    ),
  );
  console.log(result);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
