import { mkdir, readFile, writeFile, copyFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
export async function installNative(profile) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(
    await readFile(path.join(root, "dist/manifest.json"), "utf8"),
  );
  const hex = createHash("sha256")
    .update(Buffer.from(manifest.key, "base64"))
    .digest("hex")
    .slice(0, 32);
  const extensionId = [...hex]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join("");
  const base = profile
    ? path.join(profile, "LyricFlowNative")
    : path.join(homedir(), ".lyricflow", "native");
  await mkdir(base, { recursive: true, mode: 0o700 });
  await copyFile(
    path.join(root, "dist/native/genius-host.cjs"),
    path.join(base, "genius-host.cjs"),
  );
  await writeFile(
    path.join(base, "config.json"),
    JSON.stringify({ extensionId }),
    { mode: 0o600 },
  );
  const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
  const launcher = path.join(base, "launch");
  await writeFile(
    launcher,
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(base, "genius-host.cjs"))} "$@"\n`,
    { mode: 0o700 },
  );
  await chmod(launcher, 0o700);
  const roots = profile
    ? [profile]
    : process.platform === "darwin"
      ? [
          "Google/Chrome",
          "Google/ChromeForTesting",
          "Chromium",
          "com.operasoftware.OperaGX",
        ].map((p) => path.join(homedir(), "Library/Application Support", p))
      : [
          path.join(homedir(), ".config/google-chrome"),
          path.join(homedir(), ".config/chromium"),
        ];
  for (const dir of roots) {
    const folder = path.join(dir, "NativeMessagingHosts");
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, "com.lyricflow.genius.json"),
      JSON.stringify(
        {
          name: "com.lyricflow.genius",
          description: "LyricFlow public Genius page reader",
          path: launcher,
          type: "stdio",
          allowed_origins: [`chrome-extension://${extensionId}/`],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  return { extensionId, installed: true };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(await installNative(process.argv[2]));
