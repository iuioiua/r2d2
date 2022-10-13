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

await sendCommand(redisConn, ["FLUSHALL"]);

async function sendCommandTest(
  command: Command,
  expected: Reply,
): Promise<void> {
  assertEquals(await sendCommand(redisConn, command), expected);
}

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
});

/** This test must be last */
Deno.test(
  "cleanup",
  async () => {
    await assertRejects(async () => await sendCommand(redisConn, ["SHUTDOWN"]));
  },
);

addEventListener("unload", () => redisConn.close());
