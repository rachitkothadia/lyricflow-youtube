import "./qa-output.mjs";
import { chromium } from "playwright";
import { readFile, writeFile, mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, ms = 4000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out waiting for tab cleanup");
    await pause(25);
  }
}
const profile = await mkdtemp(path.join(tmpdir(), "lf-session-"));
const extension = path.join(profile, "extension");
await cp(path.resolve("dist"), extension, { recursive: true });
// Deterministic LRCLIB miss; Genius transport and tab lifecycle remain unchanged.
const bgPath = path.join(extension, "background.js");
const bg = await readFile(bgPath, "utf8");
const setup = "var lyricsProvider = new LrclibProvider();";
assert.ok(bg.includes(setup));
await writeFile(
  bgPath,
  bg.replace(
    setup,
    setup +
      ' lyricsProvider.resolve=async()=>({kind:"no-results",message:"Synthetic LRCLIB miss"});',
  ),
);
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromium.executablePath(),
  headless: process.env.LYRICFLOW_HEADED !== "1",
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const raw = (await readFile("fixtures/watch.html", "utf8")).replace(
    '<script src="/content.js"></script>',
    "",
  );
  const matched = raw
    .replaceAll("LyricFlow Test Ensemble", "Northlight")
    .replaceAll("Raaste", "Paper Sun");
  const empty = matched.replace("Northlight - Paper Sun (Official Audio)", "");
  const media = await readFile("fixtures/silent.webm");
  let blank = true,
    blocked = false,
    cookieSeen = false;
  const calls = [];
  const hit = {
    result: {
      id: 99008,
      title: "Paper Sun",
      primary_artist: { name: "Northlight" },
      url: "https://genius.com/Northlight-paper-sun-lyrics",
    },
  };
  await context.route("https://www.youtube.com/**", (r) =>
    r.fulfill(
      r.request().url().endsWith("silent.webm")
        ? { contentType: "video/webm", body: media }
        : { contentType: "text/html", body: blank ? empty : matched },
    ),
  );
  await context.route("https://lrclib.net/**", (r) =>
    r.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await context.route("https://genius.com/**", async (r) => {
    const u = new URL(r.request().url());
    calls.push({
      path: u.pathname,
      query: u.searchParams.get("q"),
      navigation: r.request().isNavigationRequest(),
    });
    if (u.searchParams.get("q") === "hanging query")
      return r.fulfill({
        contentType: "text/html",
        body: "<title>Genius</title><body></body>",
      });
    cookieSeen ||= (r.request().headers().cookie || "").includes(
      "fixture_session=ready",
    );
    if (blocked)
      return r.fulfill({
        status: 403,
        contentType: "text/html",
        body: "<title>Genius</title><body>Sorry, we have to make sure you're a human. Enable JavaScript and cookies.</body>",
      });
    if (u.pathname === "/api/search")
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ response: { hits: [hit] } }),
      });
    return r.fulfill({
      contentType: "text/html",
      body: '<meta property="og:title" content="Northlight - Paper Sun Lyrics"><div data-lyrics-container="true">Synthetic first line<br>Synthetic second line</div>',
    });
  });
  const probe = await context.newPage();
  await probe.goto(
    "chrome-extension://jlomopmaoogoaaeklagghiihgiegboel/options.html",
  );
  const unrelated = await context.newPage();
  await unrelated.goto("https://genius.com/User-opened-lyrics");
  const previousTabs = new Set(
    (await probe.evaluate(() => chrome.tabs.query({}))).map((t) => t.id),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const youtubeTab = (await probe.evaluate(() => chrome.tabs.query({}))).find(
    (t) => !previousTabs.has(t.id),
  );
  await probe.evaluate(
    (id) => chrome.tabs.update(id, { active: true }),
    youtubeTab.id,
  );
  await probe.evaluate(() => {
    globalThis.tabEvents = { created: [], removed: [], activated: [] };
    chrome.tabs.onCreated.addListener((t) =>
      globalThis.tabEvents.created.push({ id: t.id, active: t.active }),
    );
    chrome.tabs.onRemoved.addListener((id) =>
      globalThis.tabEvents.removed.push(id),
    );
    chrome.tabs.onActivated.addListener((t) =>
      globalThis.tabEvents.activated.push(t.tabId),
    );
  });
  const started = Date.now();
  await page.goto("https://www.youtube.com/watch?v=session001a", {
    waitUntil: "domcontentloaded",
  });
  const query = page.getByLabel("Song, artist or Genius link", { exact: true });
  await query.fill("paper sun");
  await query.press("Enter");
  await page.locator(".candidate").first().waitFor();
  await page
    .locator(".candidate")
    .first()
    .evaluate((b) => b.click());
  await page.locator(".line").first().waitFor();
  const lookupMs = Date.now() - started,
    received = Date.now();
  const created = (await probe.evaluate(() => globalThis.tabEvents)).created;
  check(
    "Genius lookup connects without pressing Connect Genius",
    created.length > 0,
  );
  check(
    "temporary Genius tabs stay in the background",
    created.every((t) => t.active === false),
  );
  check(
    "lookup never activates a Genius tab",
    !(await probe.evaluate(() => globalThis.tabEvents)).activated.some((id) =>
      created.some((t) => t.id === id),
    ),
  );
  check(
    "installed Genius code automatically finds and renders lyrics",
    (await page.locator(".line").count()) === 2,
  );
  let events;
  const cleanupDeadline = Date.now() + 4000;
  while (true) {
    events = await probe.evaluate(() => globalThis.tabEvents);
    if (created.every((t) => events.removed.includes(t.id))) break;
    if (Date.now() > cleanupDeadline)
      throw new Error("Temporary tabs did not close");
    await pause(25);
  }
  const closeMs = Date.now() - received;
  check("temporary tabs close after the complete lookup", true);
  check("user-opened Genius tab remains untouched", !unrelated.isClosed());
  check(
    "untimed Genius lyrics receive no invented timestamps",
    (await page.locator("button.line").count()) === 0,
  );
  await page
    .getByLabel("Lyrics options", { exact: true })
    .evaluate((b) => b.click());
  check(
    "source attribution survives automatic tab cleanup",
    (await page.locator(".source").getAttribute("href")) === hit.result.url,
  );
  blocked = true;
  const blockedOpened = context.waitForEvent("page", { timeout: 15000 });
  void blockedOpened.catch(() => {});
  await page.getByLabel("Search lyrics", { exact: true }).fill("blocked query");
  await page
    .getByRole("button", { name: "Search", exact: true })
    .evaluate((b) => b.click());
  const verification = await blockedOpened;
  await page
    .locator(".message")
    .filter({ hasText: "Genius needs browser verification" })
    .waitFor();
  await pause(250);
  check(
    "a real verification page stays open instead of being auto-closed",
    !verification.isClosed(),
  );
  check(
    "verification does not steal focus automatically",
    !(await probe.evaluate(() => globalThis.tabEvents)).activated.includes(
      (await probe.evaluate(() => globalThis.tabEvents)).created.at(-1).id,
    ),
  );
  const requestsAtBlock = calls.length;
  await pause(250);
  check(
    "verification does not cause an automatic retry loop",
    calls.length === requestsAtBlock,
  );
  await page
    .getByRole("button", { name: "Connect Genius", exact: true })
    .evaluate((b) => b.click());
  const verificationId = (
    await probe.evaluate(() => globalThis.tabEvents)
  ).created.at(-1).id;
  const focusDeadline = Date.now() + 4000;
  while (
    !(await probe.evaluate(() => globalThis.tabEvents)).activated.includes(
      verificationId,
    )
  ) {
    if (Date.now() > focusDeadline) {
      console.log(
        "Connection diagnostic",
        await probe.evaluate(() => globalThis.tabEvents),
      );
      throw new Error("Connect Genius did not activate its verification tab");
    }
    await pause(50);
  }
  check("Connect Genius focuses the existing verification tab", true);
  await context.addCookies([
    {
      name: "fixture_session",
      value: "ready",
      domain: "genius.com",
      path: "/",
      secure: true,
    },
  ]);
  blocked = false;
  await verification.reload();
  await page.locator(".candidate").first().waitFor();
  check("manual verification resumes the pending query", true);
  await page
    .locator(".candidate")
    .first()
    .evaluate((b) => b.click());
  await page.locator(".line").first().waitFor();
  check(
    "lyrics recover after simulated user verification",
    (await page.locator(".line").count()) === 2,
  );
  await verification.close();
  await page
    .getByLabel("Lyrics options", { exact: true })
    .evaluate((b) => b.click());
  const hangingOpened = context.waitForEvent("page", { timeout: 15000 });
  void hangingOpened.catch(() => {});
  await page.getByLabel("Search lyrics", { exact: true }).fill("hanging query");
  await page
    .getByRole("button", { name: "Search", exact: true })
    .evaluate((b) => b.click());
  const hanging = await hangingOpened;
  await hanging.waitForURL(/genius\.com\/api\/search/);
  blank = true;
  await page.goto("https://www.youtube.com/watch?v=session002a", {
    waitUntil: "domcontentloaded",
  });
  await until(() => hanging.isClosed());
  check(
    "video navigation cancels lookup and closes its temporary tab",
    hanging.isClosed(),
  );
  check(
    "browser session survives tab closure without cookie export",
    cookieSeen,
  );
  check(
    "Genius uses normal navigation and same-origin API search",
    calls.every((c) => c.navigation || c.path === "/api/search"),
  );
  check(
    "unrelated Genius tab also survives cancellation and verification",
    !unrelated.isClosed(),
  );
  await writeFile(
    "output/reliability/genius-session.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        lookupMs,
        closeMs,
        scope:
          "Installed MV3 extension with deterministic LRCLIB miss, unchanged Genius transport/lifecycle, synthetic Genius/YouTube responses and simulated user verification. Latencies are fixture measurements, not live-service guarantees.",
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
