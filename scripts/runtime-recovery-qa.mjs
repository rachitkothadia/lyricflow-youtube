import "./qa-output.mjs";
import { chromium } from "playwright";
import { readFile, writeFile, mkdtemp, rm, cp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { installNative } from "./install-native.mjs";
const checks = [];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks.push(name);
  console.log("PASS", name);
};
const profile = await mkdtemp(path.join(tmpdir(), "lyricflow-recovery-"));
await installNative(profile);
const testExtension = path.join(profile, "extension");
await cp(path.resolve("dist"), testExtension, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  executablePath: chromium.executablePath(),
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${testExtension}`,
    `--load-extension=${testExtension}`,
  ],
});
try {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const spy =
    '<script>window.leaked=0;window.addEventListener("keydown",e=>{if(e.key===" "&&!e.target.matches("input")){window.leaked++;document.querySelector("video")?.pause();}},true);</script>';
  const html = (await readFile("fixtures/watch.html", "utf8"))
    .replace('<script src="/content.js"></script>', "")
    .replace("LyricFlow Test Ensemble - Raaste (Official Audio)", "")
    .replace(/<!doctype[^>]*>/i, (t) => t + spy);
  const media = await readFile("fixtures/silent.webm");
  let directFetches = 0;
  await page.route("https://www.youtube.com/**", (r) =>
    r.fulfill(
      r.request().url().endsWith("silent.webm")
        ? { contentType: "video/webm", body: media }
        : { contentType: "text/html", body: html },
    ),
  );
  for (const url of ["https://genius.com/**", "https://lrclib.net/**"])
    await page.route(url, (r) => {
      directFetches++;
      return r.abort();
    });
  await page.goto("https://www.youtube.com/watch?v=reload001aa");
  const input = page.getByLabel("Song, artist or Genius link", { exact: true });
  await input.waitFor();
  await page.waitForFunction(
    () => document.querySelector("video").readyState >= 2,
  );
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  await page.getByLabel("Lyrics options", { exact: true }).click();
  check(
    "options show the actual compiled script version",
    (await page.locator(".build-info").textContent()) ===
      "LyricFlow " + version,
  );
  await page.getByLabel("Lyrics options", { exact: true }).click();
  await page.locator("video").evaluate((v) => v.play());
  await input.fill("before");
  await input.press("Space");
  check(
    "Space preserves playing state before extension reload",
    await page.evaluate(
      () => !document.querySelector("video").paused && window.leaked === 0,
    ),
  );
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const manager = await context.newPage();
  const updatedManifest = JSON.parse(
    await readFile(path.join(testExtension, "manifest.json"), "utf8"),
  );
  updatedManifest.version = version.split(".").slice(0, 3).join(".") + ".1";
  await writeFile(
    path.join(testExtension, "manifest.json"),
    JSON.stringify(updatedManifest),
  );
  await manager.goto("chrome://extensions/");
  const reloadExtension = manager
    .locator("extensions-item")
    .filter({ hasText: "LyricFlow" })
    .getByRole("button", { name: /^Reload( extension)?$/i });
  const developerMode = manager.getByLabel("Developer mode", { exact: true });
  if (!(await developerMode.evaluate((e) => e.checked)))
    await developerMode.click();
  await reloadExtension.waitFor({ state: "visible" });
  await reloadExtension.click();
  let extensionState;
  for (let i = 0; i < 60; i++) {
    extensionState = await manager
      .locator("extensions-item")
      .filter({ hasText: "LyricFlow" })
      .evaluate((e) => ({ state: e.data?.state, version: e.data?.version }));
    if (
      extensionState.state === "ENABLED" &&
      extensionState.version === updatedManifest.version
    )
      break;
    await new Promise((r) => setTimeout(r, 50));
  }
  check(
    "browser loads the updated extension while enabled",
    extensionState.state === "ENABLED" &&
      extensionState.version === updatedManifest.version,
  );
  await manager.close();
  for (let i = 0; i < 40 && context.serviceWorkers().includes(worker); i++)
    await new Promise((r) => setTimeout(r, 50));
  await page.locator("video").evaluate((v) => v.play());
  await input.fill("after");
  await input.press("Space");
  check(
    "native text focus remains safe after extension invalidation",
    (await input.inputValue()) === "after " &&
      (await page.evaluate(
        () => !document.querySelector("video").paused && window.leaked === 0,
      )),
  );
  await input.fill("reload test song");
  await input.press("Enter");
  await page.locator(".message").waitFor({ timeout: 15000 });
  check(
    "invalidated connection gives a reload explanation",
    (await page.locator(".message").textContent()).includes(
      "Reload this YouTube tab",
    ),
  );
  check(
    "disconnected installed code never falls back to direct provider fetch",
    directFetches === 0,
  );
  const reload = page.getByRole("button", {
    name: "Reload YouTube",
    exact: true,
  });
  check("recovery has an actionable reload button", await reload.isVisible());
  await Promise.all([page.waitForEvent("domcontentloaded"), reload.click()]);
  try {
    await input.waitFor({ timeout: 15000 });
  } catch (error) {
    console.log(
      "RECOVERY_STATE",
      JSON.stringify({
        url: page.url(),
        rootCount: await page.locator("#lyricflow-root").count(),
        inputCount: await input.count(),
        title: await page.title(),
        pageErrors,
        body: (await page.locator("body").innerText()).slice(0, 250),
      }),
    );
    const diagnosticManager = await context.newPage();
    await diagnosticManager.goto("chrome://extensions/");
    console.log(
      "EXTENSION_STATE",
      JSON.stringify(
        await diagnosticManager
          .locator("extensions-item")
          .filter({ hasText: "LyricFlow" })
          .evaluate((e) => ({
            state: e.data?.state,
            disabled: e.data?.disableReasons,
            errors: e.data?.runtimeErrors?.map((e) => e.message),
            warnings: e.data?.installWarnings,
            hostAccess: e.data?.runtimeHostPermissions?.hostAccess,
          })),
      ),
    );
    throw error;
  }
  await input.fill("");
  await input.press("Enter");
  await page
    .getByText("Enter a song query of 2–200 characters.", { exact: true })
    .waitFor();
  check(
    "page reload reconnects to the extension background",
    !(await page.locator(".message").textContent()).includes("disconnected") &&
      directFetches === 0,
  );
  await input.fill("khuja mat");
  await input.press("Enter");
  await page.waitForFunction(
    () => {
      const s = document.querySelector("#lyricflow-root").shadowRoot;
      return s.querySelector(".candidate") || s.querySelector(".message");
    },
    undefined,
    { timeout: 45000 },
  );
  if (!(await page.locator(".candidate").count()))
    throw new Error(await page.locator(".message").textContent());
  check(
    "real Genius search works after reconnection",
    (await page.locator(".candidate").count()) > 0,
  );
  await page
    .locator(".candidate")
    .filter({ hasText: /khuja\s+mat/i })
    .first()
    .click();
  await page.waitForFunction(
    () => {
      const s = document.querySelector("#lyricflow-root").shadowRoot;
      return s.querySelector(".line") || s.querySelector(".message");
    },
    undefined,
    { timeout: 45000 },
  );
  if (!(await page.locator(".line").count()))
    throw new Error(await page.locator(".message").textContent());
  check(
    "chosen Genius lyrics load after reconnection",
    (await page.locator(".line").count()) > 4 && directFetches === 0,
  );
  await writeFile(
    "output/reliability/runtime-recovery.json",
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        scope:
          "Installed MV3 extension, browser manager Reload invalidation and page-reload recovery; provider browser fetches blocked and counted",
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
