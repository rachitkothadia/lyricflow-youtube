import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const id = "a".repeat(32);
async function request(
  url: string,
  origin = `chrome-extension://${id}/`,
  split = false,
  length?: number,
) {
  const dir = await mkdtemp(path.join(tmpdir(), "lyricflow-native-unit-"));
  try {
    await copyFile("native/genius-host.cjs", path.join(dir, "host.cjs"));
    await writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({ extensionId: id }),
    );
    const body = Buffer.from(JSON.stringify({ url })),
      header = Buffer.alloc(4);
    header.writeUInt32LE(length ?? body.length);
    const payload = Buffer.concat([header, body]);
    return await new Promise<any>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.join(dir, "host.cjs"), origin],
        { timeout: 3000 },
      );
      const chunks: Buffer[] = [];
      child.stdout.on("data", (b) => chunks.push(b));
      child.stdin.on("error", () => {});
      child.on("error", reject);
      child.on("exit", () => {
        try {
          const raw = Buffer.concat(chunks);
          assert.equal(raw.readUInt32LE(0), raw.length - 4);
          resolve(JSON.parse(raw.subarray(4).toString("utf8")));
        } catch (e) {
          reject(e);
        }
      });
      if (split) {
        child.stdin.write(payload.subarray(0, 2));
        setTimeout(() => child.stdin.write(payload.subarray(2)), 20);
      } else child.stdin.write(payload);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("native reader rejects callers outside this extension", async () =>
  assert.match(
    (
      await request(
        "https://genius.com/api/search?q=test",
        "chrome-extension://wrong/",
      )
    ).error,
    /origin/,
  ));
test("native reader cannot fetch foreign hosts or local files", async () => {
  for (const url of [
    "https://evil.test/track-lyrics",
    "file:///etc/passwd",
    "https://genius.com@evil.test/test-lyrics",
  ])
    assert.match((await request(url)).error, /Only public/);
});
test("native reader accepts split frames but rejects unsupported endpoints", async () =>
  assert.match(
    (await request("https://genius.com/api/account", undefined, true)).error,
    /Only public/,
  ));
test("native reader bounds request size before parsing", async () =>
  assert.match(
    (
      await request(
        "https://genius.com/api/search?q=test",
        undefined,
        false,
        5000,
      )
    ).error,
    /size/,
  ));
