import { mkdir } from "node:fs/promises";
await Promise.all(
  [
    "playwright",
    "live",
    "product",
    "fixes",
    "matching",
    "fullscreen",
    "playlist",
    "reliability",
  ].map((name) => mkdir(`output/${name}`, { recursive: true })),
);
