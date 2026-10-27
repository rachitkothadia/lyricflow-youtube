import "./qa-output.mjs";
import { chromium } from "playwright";
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const bundle = await build({
  stdin: {
    contents: `import {LyricsPanel} from './src/ui/LyricsPanel';const root=document.createElement('section');root.id='lyricflow-root';document.querySelector('#secondary').prepend(root);window.panel=new LyricsPanel(root.attachShadow({mode:'open'}));window.panel.state('error',{title:'Synthetic song',artist:'Test artist',version:''},'Recovery test');window.submits=0;window.panel.onGeniusSearch=()=>window.submits++;`,
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
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const spy = `<script>window.hotkeys=[];window.addEventListener('keydown',e=>{if(document.activeElement?.matches('input,textarea,select'))return;window.hotkeys.push(e.key);if(e.key===' ')document.querySelector('video')?.pause();},true);</script>`;
  const html = (await readFile("fixtures/watch.html", "utf8"))
    .replace('<script src="/content.js"></script>', "")
    .replace(/<!doctype[^>]*>/i, (t) => t + spy);
  const bytes = await readFile("fixtures/silent.webm");
  await page.route("http://fixture.test/**", (r) =>
    r.fulfill(
      r.request().url().endsWith("silent.webm")
        ? { contentType: "video/webm", body: bytes }
        : { contentType: "text/html", body: html },
    ),
  );
  await page.goto("http://fixture.test/watch?v=native001aa");
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator("video").evaluate((v) => v.play());
  const query = page.getByLabel("Song, artist or Genius link", { exact: true });
  await query.fill("native");
  await query.press("Space");
  check(
    "Space keeps playing even when shortcut capture predates the panel",
    await page.locator("video").evaluate((v) => !v.paused),
  );
  check(
    "document focus is the actual editable input",
    await query.evaluate((e) => document.activeElement === e),
  );
  check(
    "Space inserts ordinary text",
    (await query.inputValue()) === "native ",
  );
  await query.press("Enter");
  check(
    "native-focus search still submits once",
    await page.evaluate(() => window.submits === 1),
  );
  await page.getByLabel("Lyrics options", { exact: true }).click();
  const correction = page.getByLabel("Search lyrics", { exact: true });
  await correction.fill("paper");
  await correction.press("Space");
  check(
    "correction field has native editable focus",
    await correction.evaluate((e) => document.activeElement === e),
  );
  const source = page.getByLabel("Genius song link", { exact: true });
  await source.fill("https://genius.com/test");
  await source.press("Space");
  check(
    "URL field has native editable focus",
    await source.evaluate((e) => document.activeElement === e),
  );
  const offset = page.getByLabel("Timing offset (seconds)", { exact: true });
  await offset.fill("0");
  await offset.press("ArrowUp");
  check(
    "offset field retains native focus and stepping",
    Number(await offset.inputValue()) === 0.1 &&
      (await offset.evaluate((e) => document.activeElement === e)),
  );
  check(
    "no player shortcut fires from any editable field",
    await page.evaluate(
      () =>
        window.hotkeys.length === 0 && !document.querySelector("video").paused,
    ),
  );
  await writeFile(
    "output/reliability/native-focus.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        scope:
          "Real keyboard input and silent video, with document-activeElement-based shortcuts registered before panel code and no early bootstrap",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
