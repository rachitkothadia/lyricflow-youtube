import "./qa-output.mjs";
import { chromium } from "playwright";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
};
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-keyboard-"));
const extensionDir =
  process.env.LYRICFLOW_TEST_EXTENSION || path.resolve("dist");
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromium.executablePath(),
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  viewport: { width: 1440, height: 1000 },
  args: [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
  ],
});
try {
  const page = await context.newPage();
  const spy = `<script>
    window.pageKeys=[];window.playerActions=[];
    const spy=e=>{
      if(e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
      window.pageKeys.push(e.type+':'+e.key);
      if(e.currentTarget!==window||e.eventPhase!==1||e.type!=='keydown')return;
      const v=document.querySelector('video');if(!v)return;
      if(e.key===' '||e.key==='k'){window.playerActions.push('toggle');if(v.paused)v.play();else v.pause();}
      if(e.key==='m'){window.playerActions.push('mute');v.muted=!v.muted;}
      if(e.key==='ArrowRight'||e.key==='l'){window.playerActions.push('seek');v.currentTime+=5;}
    };
    for(const type of ['keydown','keypress','keyup']){window.addEventListener(type,spy,true);document.addEventListener(type,spy,true);document.addEventListener(type,spy);}
  </script>`;
  const html = (await readFile("fixtures/watch.html", "utf8"))
    .replace('<script src="/content.js"></script>', "")
    .replace("LyricFlow Test Ensemble - Raaste (Official Audio)", "")
    .replace(/<!doctype[^>]*>/i, (tag) => tag + spy);
  assert.ok(html.includes(spy));
  const bytes = await readFile("fixtures/silent.webm");
  await page.route("https://www.youtube.com/**", async (r) => {
    if (!r.request().url().endsWith("silent.webm"))
      return r.fulfill({ contentType: "text/html", body: html });
    const range = r
        .request()
        .headers()
        .range?.match(/^bytes=(\d+)-(\d*)$/),
      start = range ? Number(range[1]) : 0;
    const end = range?.[2]
      ? Math.min(Number(range[2]), bytes.length - 1)
      : bytes.length - 1;
    return r.fulfill({
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
  await page.goto("https://www.youtube.com/watch?v=keyboard001");
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  const query = page.getByLabel("Song, artist or Genius link", { exact: true });
  await query.waitFor();
  await page.locator("video").evaluate((v) => v.play());
  await query.fill("");
  await query.focus();
  await page.keyboard.type("tera rastaa chhodoon na k m j l f 123", {
    delay: 5,
  });
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  check(
    "typing spaces keeps playback running",
    await page.locator("video").evaluate((v) => !v.paused && !v.muted),
  );
  check(
    "typing is isolated from early window and document shortcuts",
    await page.evaluate(
      () => window.pageKeys.length === 0 && window.playerActions.length === 0,
    ),
  );
  check(
    "spaces and shortcut letters remain normal text",
    (await query.inputValue()) === "tera rastaa chhodoon na k m j l f 123",
  );
  await page.locator("video").evaluate((v) => v.pause());
  await query.fill("");
  await query.press("Space");
  check(
    "typing Space also keeps paused playback paused",
    (await query.inputValue()) === " " &&
      (await page.locator("video").evaluate((v) => v.paused)),
  );
  await query.press("Tab");
  check(
    "Tab still moves to the Search Genius button",
    await page
      .locator(".genius-search button")
      .evaluate((e) => e.getRootNode().activeElement === e),
  );
  await query.fill("");
  await page.locator(".genius-search").evaluate((form) => {
    window.searchSubmits = 0;
    form.addEventListener("submit", () => window.searchSubmits++);
  });
  await query.press("Enter");
  await page
    .getByText("Enter a song query of 2–200 characters.", { exact: true })
    .waitFor();
  check(
    "Enter submits Genius search exactly once",
    await page.evaluate(() => window.searchSubmits === 1),
  );
  const menu = async () => {
    if (!(await page.locator(".settings").evaluate((e) => e.open)))
      await page.getByLabel("Lyrics options", { exact: true }).click();
  };
  await menu();
  const correction = page.getByLabel("Search lyrics", { exact: true });
  await correction.fill("");
  await correction.focus();
  await page.keyboard.type("test song k m l", { delay: 5 });
  check(
    "song correction input also keeps keys out of the player",
    await page.evaluate(() => window.playerActions.length === 0),
  );
  const url = page.getByLabel("Genius song link", { exact: true });
  await url.fill("");
  await url.focus();
  await page.keyboard.type("https://genius.com/test song k m l", { delay: 5 });
  check(
    "Genius URL input also keeps keys out of the player",
    await page.evaluate(() => window.playerActions.length === 0),
  );
  await correction.fill("");
  await page.locator(".menu").evaluate((menu) => {
    window.correctionClicks = 0;
    menu.querySelectorAll("button").forEach((b) => {
      if (b.textContent === "Search")
        b.addEventListener("click", () => window.correctionClicks++);
    });
  });
  await correction.press("Enter");
  check(
    "song correction Enter handler still runs exactly once",
    await page.evaluate(() => window.correctionClicks === 1),
  );
  await menu();
  await page.getByText("More settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Try synthetic demo", exact: true })
    .click();
  await menu();
  const delay = page.getByLabel("Timing offset (seconds)", { exact: true });
  await delay.fill("0");
  await delay.press("ArrowUp");
  check(
    "native number stepping still works without seeking the player",
    Number(await delay.inputValue()) === 0.1 &&
      (await page.evaluate(() => window.playerActions.length === 0)),
  );
  const motion = page.locator("input[type=checkbox]");
  await motion.evaluate((e) => {
    window.motionChanges = 0;
    e.addEventListener("change", () => window.motionChanges++);
  });
  await motion.focus();
  await motion.press("Space");
  check(
    "Space toggles a focused checkbox once",
    (await motion.isChecked()) &&
      (await page.evaluate(() => window.motionChanges === 1)),
  );
  await page.getByLabel("Lyrics options", { exact: true }).click();
  await page.locator("button.line").evaluateAll((lines) => {
    window.lyricClicks = 0;
    lines.forEach((e) =>
      e.addEventListener("click", () => window.lyricClicks++),
    );
  });
  const line = page.locator("button.line").nth(2);
  await line.focus();
  await line.press("Space");
  await page.waitForFunction(() => !document.querySelector("video").seeking);
  await page.locator("video").evaluate((v) => v.pause());
  check(
    "Space activates a focused lyric exactly once",
    await page.evaluate(
      () =>
        window.lyricClicks === 1 &&
        Math.abs(document.querySelector("video").currentTime - 8.1) < 0.5,
    ),
  );
  await page.locator("button.line").nth(3).press("Enter");
  await page.waitForFunction(() => !document.querySelector("video").seeking);
  await page.locator("video").evaluate((v) => v.pause());
  check(
    "Enter still activates a lyric exactly once",
    await page.evaluate(
      () =>
        window.lyricClicks === 2 &&
        Math.abs(document.querySelector("video").currentTime - 12.1) < 0.5,
    ),
  );
  check(
    "no panel keyboard event reached page shortcut handlers",
    await page.evaluate(() => window.pageKeys.length === 0),
  );
  await page.locator(".viewport").focus();
  await page.keyboard.press("Tab");
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.querySelector("#lyricflow-root").shadowRoot.activeElement?.blur();
    window.pageKeys = [];
    window.playerActions = [];
  });
  await page.keyboard.press("Space");
  check(
    "YouTube-style Space shortcut still works outside the extension",
    await page.evaluate(
      () =>
        window.playerActions.includes("toggle") &&
        !document.querySelector("video").paused,
    ),
  );
  await page.locator("video").evaluate((v) => v.pause());
  await writeFile(
    "output/reliability/keyboard.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        scope:
          "Installed extension with real keyboard input and silent video on routed layout; page shortcut handlers registered during head parsing before the main panel script",
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
