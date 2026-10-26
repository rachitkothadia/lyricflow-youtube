// Fixed-origin, one-request native reader. No server, cookies, proxy, or challenge handling.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const config = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf8"));
process.stdout.on("error", () => process.exit(0));
let finished = false,
  input = Buffer.alloc(0);
function send(value) {
  if (finished) return;
  finished = true;
  let data = Buffer.from(JSON.stringify(value));
  if (data.length > 900000)
    data = Buffer.from(
      JSON.stringify({ error: "Genius page exceeds the local reader limit." }),
    );
  const header = Buffer.alloc(4);
  header.writeUInt32LE(data.length);
  process.stdout.write(Buffer.concat([header, data]), () => process.exit(0));
}
if (process.argv[2] !== `chrome-extension://${config.extensionId}/`) {
  send({ error: "Unexpected extension origin." });
} else {
  const deadline = setTimeout(
    () => send({ error: "Genius reader timed out." }),
    16000,
  );
  process.stdin.on("data", async (chunk) => {
    if (finished) return;
    input = Buffer.concat([input, chunk]);
    if (input.length < 4) return;
    const size = input.readUInt32LE(0);
    if (size > 4096) {
      send({ error: "Invalid native request size." });
      return;
    }
    if (input.length < size + 4) return;
    process.stdin.pause();
    try {
      const message = JSON.parse(input.subarray(4, 4 + size).toString("utf8"));
      const url = new URL(message.url);
      const page = /^\/[a-z\d%'-]+-lyrics$/i.test(url.pathname) && !url.search;
      const search =
        url.pathname === "/api/search" &&
        [...url.searchParams.keys()].every((k) => k === "q") &&
        url.searchParams.get("q")?.length <= 300;
      if (
        url.origin !== "https://genius.com" ||
        url.username ||
        url.password ||
        url.hash ||
        !(page || search)
      )
        throw new Error(
          "Only public Genius song and search pages are supported.",
        );
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      const text = await response.text();
      send({ status: response.status, body: text });
    } catch (error) {
      send({ error: error.message || "Genius request failed." });
    } finally {
      clearTimeout(deadline);
    }
  });
  process.stdin.on("end", () => {
    if (!finished) send({ error: "Native request ended before completion." });
  });
}
