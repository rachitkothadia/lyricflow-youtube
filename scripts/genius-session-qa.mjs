import "./qa-output.mjs";
import { chromium } from "playwright";
import { readFile, writeFile, mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const checks = [];
function check(name, ok) {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
}
const profile = await mkdtemp(path.join(tmpdir(), "lf-session-"));
// Reproduce native rejection in a disposable copy; exercise actual session/browser code.
const extension = path.join(profile, "extension");
await cp(path.resolve("dist"), extension, { recursive: true });
const backgroundPath = path.join(extension, "background.js");
const background = await readFile(backgroundPath, "utf8");
assert.ok(background.includes("async function geniusTransport(input, init) {"));
await writeFile(
  backgroundPath,
  background.replace(
    "async function geniusTransport(input, init) {",
    "async function geniusTransport(input, init) { const browserResult = await sessionGeniusRequest(String(input), init?.signal || undefined); if(browserResult) return browserResult; throw new Error(geniusVerification);",
  ),
);
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromium.executablePath(),
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const fixture = (await readFile("fixtures/watch.html", "utf8"))
    .replace('<script src="/content.js"></script>', "")
    .replace("LyricFlow Test Ensemble - Raaste (Official Audio)", "");
  const media = await readFile("fixtures/silent.webm");
  await context.route("https://www.youtube.com/**", (r) =>
    r.fulfill(
      r.request().url().endsWith("silent.webm")
        ? { contentType: "video/webm", body: media }
        : { contentType: "text/html", body: fixture },
    ),
  );
  let challenge = true,
    forbidden = false,
    calls = [],
    cookieSeen = false;
  const result = {
    result: {
      id: 99008,
      title: "Paper Sun",
      primary_artist: { name: "Northlight" },
      url: "https://genius.com/Northlight-paper-sun-lyrics",
    },
  };
  await context.route("https://genius.com/**", async (r) => {
    const u = new URL(r.request().url());
    calls.push({
      path: u.pathname,
      navigation: r.request().isNavigationRequest(),
    });
    if (u.pathname === "/")
      return r.fulfill({
        contentType: "text/html",
        body: challenge
          ? "<title>Genius</title><body>Sorry, we have to make sure you're a human. Enable JavaScript and cookies.</body>"
          : "<title>Genius</title><body><h1>Genius browser session fixture</h1>" +
            "Public synthetic homepage. ".repeat(20) +
            "</body>",
      });
    cookieSeen ||= (r.request().headers().cookie || "").includes(
      "fixture_session=ready",
    );
    if (forbidden)
      return r.fulfill({
        status: 403,
        headers: { "cf-mitigated": "challenge" },
        body: "Sorry, we have to make sure you're a human. Enable JavaScript and cookies.",
      });
    if (u.pathname === "/api/search")
      return r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ response: { hits: [result] } }),
      });
    return r.fulfill({
      contentType: "text/html",
      body: '<meta property="og:title" content="Northlight - Paper Sun Lyrics"><div data-lyrics-container="true">Synthetic first line<br>Synthetic second line</div>',
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.goto("https://www.youtube.com/watch?v=session001a", {
    waitUntil: "domcontentloaded",
  });
  const input = page.getByLabel("Song, artist or Genius link", { exact: true });
  await input.fill("paper sun");
  await input.press("Enter");
  await page.waitForFunction(
    () =>
      [
        ...document
          .querySelector("#lyricflow-root")
          .shadowRoot.querySelectorAll("button"),
      ].some((b) => b.textContent === "Connect Genius"),
    undefined,
    { timeout: 25000 },
  );
  check(
    "manual recovery offers browser connection during a pending lookup",
    await page
      .getByRole("button", { name: "Connect Genius", exact: true })
      .isVisible(),
  );
  const opened = context.waitForEvent("page", { timeout: 15000 });
  await page.evaluate(() =>
    [
      ...document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelectorAll("button"),
    ]
      .find((b) => b.textContent === "Connect Genius")
      .click(),
  );
  const genius = await opened;
  await genius.waitForURL("https://genius.com/");
  check(
    "connection opens an ordinary visible Genius page",
    context.pages().filter((p) => p.url().startsWith("https://genius.com"))
      .length === 1,
  );
  await page.waitForTimeout(400);
  check(
    "challenge is left to the user with no API retries",
    calls.filter((c) => c.path === "/api/search").length === 0,
  );
  await context.addCookies([
    {
      name: "fixture_session",
      value: "ready",
      domain: "genius.com",
      path: "/",
      secure: true,
    },
  ]);
  // Simulate a successful manual check by replacing our controlled challenge document.
  challenge = false;
  await genius.reload();
  await page
    .locator(".candidate")
    .first()
    .waitFor()
    .catch(async (error) => {
      console.log(
        "Source diagnostic",
        await genius.evaluate(() => ({
          url: location.href,
          pre: document.querySelector("pre")?.textContent,
          text: document.body.innerText.slice(0, 500),
        })),
      );
      throw error;
    });
  check(
    "manual query automatically retries after verification",
    (await input.inputValue()) === "paper sun",
  );
  check(
    "Genius navigations use the browser session without exporting cookies",
    cookieSeen,
  );
  check("verification tab remains open", !genius.isClosed());
  await page
    .locator(".candidate")
    .first()
    .evaluate((b) => b.click());
  await page.locator(".line").first().waitFor();
  check(
    "selected Genius page loads lyrics after native 403",
    (await page.locator(".line").count()) === 2,
  );
  await page
    .getByLabel("Lyrics options", { exact: true })
    .evaluate((b) => b.click());
  check(
    "Genius attribution remains attached to its canonical page",
    (await page.locator(".source").getAttribute("href")) === result.result.url,
  );
  check(
    "browser-session lyrics do not gain invented timing",
    (await page.locator("button.line").count()) === 0,
  );
  forbidden = true;
  await page.getByLabel("Search lyrics", { exact: true }).fill("blocked query");
  await page.getByRole("button",{name:"Search",exact:true}).evaluate(b=>b.click());
  await page
    .locator(".message")
    .filter({ hasText: "Genius needs browser verification" })
    .waitFor();
  check(
    "a repeated browser challenge remains an explicit verification state",
    true,
  );
  await page.evaluate(() =>
    [
      ...document
        .querySelector("#lyricflow-root")
        .shadowRoot.querySelectorAll("button"),
    ]
      .find((b) => b.textContent === "Connect Genius")
      .click(),
  );
  check(
    "reconnecting reuses the owned Genius tab",
    context.pages().filter((p) => p.url().startsWith("https://genius.com"))
      .length === 1,
  );
  await genius.close();
  await page
    .getByLabel("Song, artist or Genius link", { exact: true })
    .fill("closed tab query");
  await input.press("Enter");
  await page
    .locator(".message")
    .filter({ hasText: "Genius needs browser verification" })
    .waitFor();
  check("closing the session tab returns to actionable connection state", true);
  await writeFile(
    "output/reliability/genius-session.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        scope:
          "Installed MV3 extension with deterministic native 403, synthetic Genius browser responses and simulated manual verification; not successful live Cloudflare verification",
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
