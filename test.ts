import { assertEquals, assertRejects } from "./deps.ts";
import {
  type Command,
  listenReplies,
  pipelineCommands,
  type Reply,
  sendCommand,
  writeCommand,
} from "./mod.ts";

const REDIS_PORT = 6379;

const redisConn = await Deno.connect({ port: REDIS_PORT });

async function sendCommandTest(
  command: Command,
  expected: Reply,
): Promise<void> {
  assertEquals(await sendCommand(redisConn, command), expected);
}

Deno.test("r2d2", async (t) => {
  await t.step("sendCommand parses simple string", async () => {
    await sendCommandTest(["PING"], "PONG");
  });

  await t.step("sendCommand parses error", async () => {
    await assertRejects(async () =>
      await sendCommand(redisConn, ["helloworld"])
    );
  });

  await t.step("sendCommand parses integer", async () => {
    await sendCommandTest(["INCR", "integer"], 1);
    await sendCommandTest(["INCR", "integer"], 2);
  });

  await t.step("sendCommand parses bulk string", async () => {
    await sendCommand(redisConn, ["SET", "big ups", "west side massive"]);
    await sendCommandTest(["GET", "big ups"], "west side massive");
  });

  await t.step("sendCommand parses parses null", async () => {
    await sendCommandTest(["GET", "nonexistant"], null);
  });

  await t.step("sendCommand parses array", async () => {
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
  });

  await t.step("sendCommand parses empty array", async () => {
    await sendCommandTest(["HGETALL", "nonexistant"], []);
  });

  await t.step("sendCommand parses null array", async () => {
    await sendCommandTest(["BLPOP", "list", 1], null);
  });

  await t.step("sendCommand works with transactions", async () => {
    await sendCommandTest(["MULTI"], "OK");
    await sendCommandTest(["INCR", "FOO"], "QUEUED");
    await sendCommandTest(["INCR", "BAR"], "QUEUED");
    await sendCommandTest(["EXEC"], [1, 1]);
  });

  await t.step("pipelineCommands works", async () => {
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

  await t.step("listenReplies works", async () => {
    await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
    for await (const reply of listenReplies(redisConn)) {
      assertEquals(reply, ["subscribe", "mychannel", 1]);
      await writeCommand(redisConn, ["UNSUBSCRIBE"]);
      break;
    }
  });
});

addEventListener("unload", async () => {
  await writeCommand(redisConn, ["SHUTDOWN"]);
  redisConn.close();
});
