import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { resolve } from "node:path";
import { mkdir, writeFile, copyFile, cp } from "node:fs/promises";
await mkdir("dist", { recursive: true });
let extensionKey;
try {
  extensionKey = JSON.parse(await readFile("extension-key.json", "utf8")).key;
} catch {
  extensionKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .publicKey.export({ type: "spki", format: "der" })
    .toString("base64");
  await writeFile(
    "extension-key.json",
    JSON.stringify({ key: extensionKey }, null, 2),
  );
}
await mkdir("dist/native", { recursive: true });
await copyFile("native/genius-host.cjs", "dist/native/genius-host.cjs");
await Promise.all([
  build({
    entryPoints: ["src/keyboard-entry.ts"],
    outfile: "dist/keyboard.js",
    bundle: true,
    format: "iife",
    target: "chrome120",
  }),
  build({
    entryPoints: ["src/entry.ts"],
    alias: { path: resolve("src/lyrics/browserPath.ts") },
    outfile: "dist/content.js",
    bundle: true,
    format: "iife",
    target: "chrome120",
  }),
  build({
    entryPoints: ["src/background.ts"],
    outfile: "dist/background.js",
    bundle: true,
    format: "esm",
    target: "chrome120",
  }),
  build({
    entryPoints: ["src/settings/options.ts"],
    outfile: "dist/options.js",
    bundle: true,
    target: "chrome120",
  }),
]);
await build({
  entryPoints: ["src/recognition/offscreen.ts"],
  outfile: "dist/offscreen.js",
  bundle: true,
  format: "esm",
  target: "chrome120",
});
await copyFile("fixtures/offscreen.html", "dist/offscreen.html");
await cp("node_modules/kuromoji/dict", "dist/dict", { recursive: true });
await mkdir("dist/licenses", { recursive: true });
for (const [name, files] of Object.entries({
  kuromoji: ["LICENSE-2.0.txt", "NOTICE.md"],
  kuroshiro: ["LICENSE"],
  "kuroshiro-analyzer-kuromoji": ["LICENSE"],
  "pinyin-pro": ["LICENSE"],
  "@indic-transliteration/sanscript": ["LICENSE"],
})) {
  for (const file of files)
    await copyFile(
      `node_modules/${name}/${file}`,
      `dist/licenses/${name.replaceAll("/", "-")}-${file}`,
    );
}
await writeFile(
  "dist/licenses/koroman.txt",
  "koroman 1.0.16 is distributed under MIT; its license notice is retained in content.js. Author: Donghe Youn. See installed package metadata.\n",
);
await copyFile("fixtures/options.html", "dist/options.html");
await writeFile(
  "dist/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      key: extensionKey,
      name: "LyricFlow — Romanized lyrics",
      version: "0.8.1",
      minimum_chrome_version: "120",
      description:
        "Compact animated lyrics for YouTube, automatic song matching, and local Romanization.",
      permissions: [
        "nativeMessaging",
        "storage",
        "tabCapture",
        "offscreen",
        "activeTab",
      ],
      commands: {
        _execute_action: {
          suggested_key: { default: "Ctrl+Shift+Y", mac: "Command+Shift+Y" },
        },
      },
      action: {
        default_title: "Recognize song: send 10 seconds of tab audio to AudD",
      },
      web_accessible_resources: [
        { resources: ["dict/*"], matches: ["https://www.youtube.com/*"] },
      ],
      host_permissions: [
        "https://genius.com/*",
        "https://api.genius.com/*",
        "https://lrclib.net/*",
        "https://api.audd.io/*",
      ],
      background: { service_worker: "background.js", type: "module" },
      options_page: "options.html",
      content_scripts: [
        {
          matches: ["https://www.youtube.com/*"],
          js: ["keyboard.js"],
          run_at: "document_start",
        },
        {
          matches: ["https://www.youtube.com/*"],
          js: ["content.js"],
          run_at: "document_idle",
        },
      ],
    },
    null,
    2,
  ),
);
console.log("Built unpacked extension in dist/");
