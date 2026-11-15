import test from "node:test";
import assert from "node:assert/strict";
import { backgroundReady, extensionCall } from "../src/lyrics/requests";
test("background readiness connects without sending lyric work", async () => {
  const sent: unknown[] = [];
  await backgroundReady(async (message) => {
    sent.push(message);
    return { ok: true };
  });
  assert.deepEqual(sent, [{ type: "LYRICS_READY" }]);
});
test("a stalled first worker channel is retried without duplicating a lookup", async () => {
  let calls = 0;
  await backgroundReady(async () =>
    ++calls === 1 ? new Promise(() => {}) : { ok: true },
  );
  assert.equal(calls, 2);
});
test("worker startup failure stops after bounded attempts", async () => {
  let calls = 0;
  await assert.rejects(
    backgroundReady(async () => {
      calls++;
      throw new Error("disconnected");
    }),
    /Reload this YouTube tab/,
  );
  assert.equal(calls, 3);
});

test("extension APIs support callback-only bindings", async () => {
  assert.equal(
    await extensionCall<number>((done) => {
      setTimeout(() => done(42), 0);
    }),
    42,
  );
});
test("extension APIs preserve Promise-backed adapters", async () => {
  assert.equal(await extensionCall<number>(() => Promise.resolve(7)), 7);
});
test("extension API callback errors are consumed and rejected", async () => {
  const previous = Reflect.get(globalThis, "chrome");
  Reflect.set(globalThis, "chrome", {
    runtime: { lastError: { message: "Native failure" } },
  });
  try {
    await assert.rejects(
      extensionCall<void>((done) => done()),
      /Native failure/,
    );
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "chrome");
    else Reflect.set(globalThis, "chrome", previous);
  }
});
