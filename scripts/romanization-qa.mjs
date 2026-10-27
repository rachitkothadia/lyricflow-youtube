import "./qa-output.mjs";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const checks = [];
function check(name, ok) { assert.ok(ok, name); checks.push(name); }
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const html = (await readFile("fixtures/watch.html", "utf8"))
    .replace('<script src="/content.js"></script>', "");
  const media = await readFile("fixtures/silent.webm");
  await page.route("http://fixture.test/**", r => {
    if (!r.request().url().endsWith("silent.webm"))
      return r.fulfill({ contentType: "text/html", body: html });
    const range = r.request().headers()["range"]?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
    return r.fulfill({ status: range ? 206 : 200, contentType: "video/webm",
      headers: { "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1),
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${media.length}` } : {}) },
      body: media.subarray(start, end + 1) });
  });
  await page.goto("http://fixture.test/watch?v=reading0001");
  await page.evaluate(() => {
    window.chrome ||= {};
    Object.defineProperty(window.chrome, "runtime", { configurable: true, value: {
      id: "fixture", onMessage: { addListener() {}, removeListener() {} },
      sendMessage: async message => message.type === "TIMING_LOAD" ? { profile: null }
        : { kind: "ready", lyrics: {
          song: { title: "Reading test", artist: "Synthetic words", version: "" },
          sourceUrl: "https://lrclib.net/api/get/99008", sourceLabel: "LRCLIB",
          provenance: "lrclib", romanized: false,
          lines: [{ text: "संग मैं अलग", time: 0 }, { text: "हूँ हैं में", time: 4 },
            { text: "Hello café!  déjà-vu", time: 8 }],
        } },
    } });
  });
  await page.addScriptTag({ content: await readFile("dist/content.js", "utf8") });
  const lines = page.locator(".line");
  await page.waitForFunction(() => document.querySelector("#lyricflow-root")?.shadowRoot
    .querySelector(".line")?.textContent === "sang main alag");
  check("built panel displays readable Hindi", (await lines.allTextContents())[1] === "hoon hain mein");
  check("existing Latin spelling and accents survive", (await lines.allTextContents())[2] === "Hello café!  déjà-vu");
  await page.getByLabel("Lyrics options", { exact: true }).click();
  check("generated reading is labeled and source stays attributed",
    (await page.locator(".menu .provenance").first().textContent()).includes("generated Romanization") &&
    (await page.locator(".source").getAttribute("href")) === "https://lrclib.net/api/get/99008");
  await page.getByLabel("Romanization language").selectOption("sa");
  await page.waitForFunction(() => document.querySelector("#lyricflow-root").shadowRoot
    .querySelector(".line")?.textContent === "sanga main alaga");
  check("literal Devanagari option preserves inherent vowels", true);
  await page.getByLabel("Romanization language").selectOption("hi");
  await page.waitForFunction(() => document.querySelector("#lyricflow-root").shadowRoot
    .querySelector(".line")?.textContent === "sang main alag");
  await page.getByLabel("Lyrics options", { exact: true }).click();
  await page.waitForFunction(() => document.querySelector("video").readyState >= 2);
  await lines.nth(1).click();
  await page.waitForFunction(() => Math.abs(document.querySelector("video").currentTime - 4) < 1);
  check("conversion preserves source timestamp seeking",
    await page.locator("video").evaluate(v => Math.abs(v.currentTime - 4) < 1));
  check("no browser errors", errors.length === 0);
  await writeFile("output/reliability/romanization.json", JSON.stringify({ passed: checks.length, checks,
    scope: "Built content bundle on synthetic layout, mocked source words and silent media; no live song or user browser check" }, null, 2));
  console.log(`${checks.length} Romanization browser checks passed`);
} finally { await browser.close(); }
