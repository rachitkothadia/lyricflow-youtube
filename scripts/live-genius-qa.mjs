import { installNative } from "./install-native.mjs";
import { chromium } from "playwright";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-genius-"));
await installNative(profile);
const c = await chromium.launchPersistentContext(profile, {
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
  const p = await c.newPage();
  await p.goto("https://www.youtube.com/watch?v=bkshVU8FN4Q", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.locator("#lyricflow-root").waitFor({ timeout: 25000 });
  await p.waitForFunction(
    () => {
      const s = document.querySelector("#lyricflow-root").shadowRoot;
      return s.querySelector(".line,.candidate,.message");
    },
    undefined,
    { timeout: 45000 },
  );
  if (!(await p.locator("#lyricflow-root .line").count())) {
    console.log(
      "DIAG",
      await p
        .locator("#lyricflow-root")
        .evaluate((r) => ({
          raw: document
            .querySelector("ytd-watch-metadata h1")
            ?.textContent.trim(),
          channel: document.querySelector(
            "ytd-video-owner-renderer #channel-name a, #owner #channel-name a",
          )?.textContent,
          title: r.shadowRoot.querySelector("h2").textContent,
          status: r.shadowRoot.querySelector("[role=status]").textContent,
          message: r.shadowRoot.querySelector(".message")?.textContent,
          candidates: [...r.shadowRoot.querySelectorAll(".candidate")].map(
            (e) => e.textContent,
          ),
        })),
    );
    throw new Error("Live automatic match failed");
  }
  const result = await p.locator("#lyricflow-root").evaluate((root) => {
    const s = root.shadowRoot;
    return {
      url: location.href,
      rawTitle: document
        .querySelector("ytd-watch-metadata h1")
        ?.textContent.trim(),
      title: s.querySelector("h2").textContent,
      lines: s.querySelectorAll(".line").length,
      source: s.querySelector(".source")?.href,
      height: root.getBoundingClientRect().height,
      normalFlow: getComputedStyle(root).position === "static",
      optionsClosed: !s.querySelector(".settings").open,
      timestamps: s.querySelectorAll(".line[data-time]").length,
    };
  });
  assert.ok(result.source === "https://genius.com/Karma-underpressure-lyrics");
  assert.ok(result.lines > 20);
  assert.ok(result.normalFlow && result.optionsClosed);
  await writeFile(
    "output/product/live-karma.json",
    JSON.stringify(result, null, 2),
  );
  console.log(result);
} finally {
  await c.close();
  await rm(profile, { recursive: true, force: true });
}
