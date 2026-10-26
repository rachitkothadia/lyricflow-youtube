import http from "node:http";
import { readFile } from "node:fs/promises";
http
  .createServer(async (req, res) => {
    const path =
      req.url === "/content.js"
        ? "dist/content.js"
        : req.url === "/silent.webm"
          ? "fixtures/silent.webm"
          : "fixtures/watch.html";
    try {
      res.setHeader(
        "Content-Type",
        path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".webm")
            ? "video/webm"
            : "text/html",
      );
      const bytes = await readFile(path);
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]),
          end = range[2]
            ? Math.min(Number(range[2]), bytes.length - 1)
            : bytes.length - 1;
        res.writeHead(206, {
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
          "Content-Length": end - start + 1,
        });
        res.end(bytes.subarray(start, end + 1));
      } else {
        res.setHeader("Content-Length", bytes.length);
        res.end(bytes);
      }
    } catch {
      res.statusCode = 404;
      res.end("Run npm run build first.");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log(
      "Fixture at http://127.0.0.1:4173/watch?v=fixture — synthetic QA only",
    ),
  );
