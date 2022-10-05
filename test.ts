import { assertEquals, assertRejects } from "./deps.ts";

import {
  type Command,
  listenReplies,
  pipelineCommands,
  type Reply,
  sendCommand,
  writeCommand,
} from "./mod.ts";

/** Default port for Redis. */
export const PORT = 6379;
const redisConn = await Deno.connect({ port: PORT });

async function sendCommandTest(
  command: Command,
  expected: Reply,
): Promise<void> {
  assertEquals(await sendCommand(redisConn, command), expected);
}

Deno.test("RESP v2", async (t) => {
  await t.step(
    "simple string",
    async () => await sendCommandTest(["PING"], "PONG"),
  );

  await t.step("error", async () => {
    await assertRejects(async () =>
      await sendCommand(redisConn, ["helloworld"])
    );
  });

  await t.step("integer", async () => {
    await sendCommandTest(["INCR", "integer"], 1);
    await sendCommandTest(["INCR", "integer"], 2);
  });

  await t.step("bulk string", async () => {
    await sendCommand(redisConn, ["SET", "big ups", "west side massive"]);
    await sendCommandTest(["GET", "big ups"], "west side massive");
  });

  await t.step("null", async () => {
    await sendCommandTest(["GET", "nonexistant"], null);
  });

  await t.step("array", async () => {
    await sendCommand(redisConn, [
      "HSET",
      "hash",
      "hello",
      "world",
      "integer",
      13,
    ]);
    await sendCommandTest([
      "HMGET",
      "hash",
      "hello",
      "integer",
      "nonexistant",
    ], ["world", "13", null]);
    /** Empty array */
    await sendCommandTest(["HGETALL", "nonexistant"], []);
    /** Null array */
    await sendCommandTest(["BLPOP", "list", 1], null);
  });
});

Deno.test("methods", async (t) => {
  await t.step("transactions", async () => {
    await sendCommandTest(["MULTI"], "OK");
    await sendCommandTest(["INCR", "FOO"], "QUEUED");
    await sendCommandTest(["INCR", "BAR"], "QUEUED");
    await sendCommandTest(["EXEC"], [1, 1]);
  });

  await t.step("pipelining", async () => {
    assertEquals(
      await pipelineCommands(redisConn, [
        ["INCR", "X"],
        ["INCR", "X"],
        ["INCR", "X"],
        ["INCR", "X"],
      ]),
      [1, 2, 3, 4],
    );
  });

  await t.step("listening", async () => {
    await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
    const iterator = listenReplies(redisConn);
    assertEquals(await iterator.next(), {
      value: ["subscribe", "mychannel", 1],
      done: false,
    });
    await writeCommand(redisConn, ["UNSUBSCRIBE"]);
    assertEquals(await iterator.next(), {
      value: ["unsubscribe", "mychannel", 0],
      done: false,
    });
  });

  /** This test must be last */
  await t.step("no reply", async () => {
    await assertRejects(async () => await sendCommand(redisConn, ["SHUTDOWN"]));
  });
});

addEventListener("unload", () => redisConn.close());
