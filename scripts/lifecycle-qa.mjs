import { chromium } from "playwright";
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const bundle = await build({
  alias: {path: decodeURIComponent(new URL("../src/lyrics/browserPath.ts", import.meta.url).pathname)},
  stdin: {
    contents: `import {start} from './src/content';import {LyricsPanel} from './src/ui/LyricsPanel';import {demo} from './src/fixtures';window.testApp=start();window.makePanel=(root)=>new LyricsPanel(root);window.demo=demo;`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  target: "chrome120",
});
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath(),
  headless: true,
});
const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(10000);
  const html = (await readFile("fixtures/watch.html", "utf8")).replace(
    '<script src="/content.js"></script>',
    "",
  );
  await page.route("http://fixture.test/**", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("http://fixture.test/watch?v=first");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  check(
    "app inserts once",
    (await page.locator("#lyricflow-root").count()) === 1,
  );
  await page.evaluate(() => {
    window.testApp.dispose();
    window.testApp.dispose();
    document.dispatchEvent(new Event("yt-navigate-finish"));
    document
      .querySelector("#secondary-inner")
      .append(document.createElement("div"));
  });
  await page.waitForTimeout(250);
  check(
    "dispose disconnects observers/listeners and is idempotent",
    (await page.locator("#lyricflow-root").count()) === 0,
  );
  await page.evaluate(() => {
    document.querySelector("#secondary-inner").remove();
    window.testApp = window.testApp;
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  check(
    "secondary fallback safe insertion",
    await page
      .locator("#lyricflow-root")
      .evaluate((e) => e.parentElement.id === "secondary"),
  );
  await page.evaluate(() => {
    Object.defineProperty(window.chrome, "runtime", {
      configurable: true,
      value: {
        id: "fixture",
        onMessage: {addListener(){}, removeListener(){}},
        sendMessage: () =>
          new Promise((resolve) => { if (!window.releaseSearch) window.releaseSearch = resolve; }),
      },
    });
  });
  await page.getByLabel("Lyrics options", {exact:true}).click();
  await page.getByRole("button", { name: "Correct song", exact: true }).click();
  await page
    .getByLabel("Search lyrics", { exact: true })
    .fill("Old Artist - Old Song");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("Finding lyrics…", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next video", exact: true }).click();
  await page.evaluate(() =>
    window.releaseSearch({
      kind: "ambiguous", candidates: [
        {
          title: "Old Song",
          artist: "Old Artist",
          version: "",
          id: 1,
          url: "https://genius.com/",
          romanized: true,
        },
      ],
    }),
  );
  await page.waitForTimeout(100);
  check(
    "obsolete search cannot overwrite new video",
    (await page.locator("#lyricflow-root h2").innerText()) === "Other Song" &&
      (await page.locator(".candidate").count()) === 0,
  );
  await page.evaluate(() => {
    window.testApp.dispose();
    const root = document.createElement("section");
    root.id = "state-test";
    document.body.append(root);
    window.panel = window.makePanel(root.attachShadow({ mode: "open" }));
  });
  for (const state of [
    "initial",
    "detecting",
    "loading",
    "unavailable",
    "no-results",
    "error",
  ]) {
    await page.evaluate(
      (s) =>
        window.panel.state(
          s,
          { title: "A long title ".repeat(30), artist: "Artist", version: "" },
          "Recoverable state: " + s,
        ),
      state,
    );
    check(
      `${state} state preserves stable controls`,
      (await page.locator("#state-test button").count()) >= 4,
    );
    check(
      `${state} long title fits`,
      await page
        .locator("#state-test h2")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
  }
  await page.evaluate(() => {
    window.panel.showCandidates(window.demo.song, [
      {
        ...window.demo.song,
        id: 1,
        url: "https://genius.com/",
        romanized: true,
      },
      {
        ...window.demo.song,
        id: 2,
        url: "https://genius.com/",
        romanized: true,
      },
    ]);
    window.selected = 0;
    window.panel.onChoose = (c) => (window.selected = c.id);
  });
  await page.locator("#state-test .candidate").last().focus();
  await page.keyboard.press("Enter");
  check(
    "ambiguous recording selection keyboard accessible",
    await page.evaluate(() => window.selected === 2),
  );
  await page.evaluate(() =>
    window.panel.lyrics({
      ...window.demo,
      lines: window.demo.lines.map(({ time, ...l }) => l),
    }),
  );
  check(
    "untimed lyrics never active",
    (await page.locator("#state-test .active").count()) === 0,
  );
  check(
    "untimed status explicit",
    (await page.locator("#state-test .menu .provenance").first().textContent()).includes("No line timestamps"),
  );
  await page.locator("#state-test").getByLabel("Lyrics options", {exact:true}).click();
  await page
    .locator("#state-test")
    .getByRole("button", { name: "Retry", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  check(
    "keyboard reaches next control",
    await page
      .locator("#state-test").getByRole("button", {name:"Correct song",exact:true})
      .evaluate((e) => e.getRootNode().activeElement === e),
  );
  check(
    "focus visible outline",
    await page
      .locator("#state-test").getByRole("button", {name:"Correct song",exact:true})
      .evaluate((e) => getComputedStyle(e).outlineStyle !== "none"),
  );
  await page.screenshot({
    path: "output/playwright/untimed-state.png",
    fullPage: true,
  });
  await writeFile(
    "output/playwright/lifecycle-results.json",
    JSON.stringify(
      {
        date: "2026-10-26",
        mode: "isolated browser fixture and test-only module harness",
        passed: checks.length,
        checks,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  await browser.close();
}
