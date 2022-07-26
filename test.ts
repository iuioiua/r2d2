import { assertEquals, assertRejects } from "./deps.ts";
import {
  type Command,
  listenReplies,
  pipelineCommands,
  type Reply,
  sendCommand,
  writeCommand,
} from "./mod.ts";
import { REDIS_PORT, SERVER_PROCESS } from "./_util.ts";

async function flushDB(redisConn: Deno.Conn): Promise<void> {
  await sendCommand(redisConn, ["FLUSHDB"]);
}

Deno.test({
  name: "sendCommand",
  async fn(t) {
    await SERVER_PROCESS.status();
    const redisConn = await Deno.connect({ port: REDIS_PORT });

    async function sendCommandTest(
      command: Command,
      expected: Reply,
    ): Promise<void> {
      assertEquals(await sendCommand(redisConn, command), expected);
    }

    await flushDB(redisConn);

    await t.step("parses simple string", async () => {
      await sendCommandTest(["PING"], "PONG");
    });

    await t.step("parses error", () => {
      assertRejects(async () => await sendCommand(redisConn, ["helloworld"]));
    });

    await t.step("parses integer", async () => {
      await sendCommandTest(["INCR", "integer"], 1);
      await sendCommandTest(["INCR", "integer"], 2);
    });

    await t.step("parses bulk string", async () => {
      await sendCommand(redisConn, ["SET", "big ups", "west side massive"]);
      await sendCommandTest(["GET", "big ups"], "west side massive");
    });

    await t.step("parses null", async () => {
      await sendCommandTest(["GET", "nonexistant"], null);
    });

    await t.step("parses array", async () => {
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

    await t.step("parses empty array", async () => {
      await sendCommandTest(["HGETALL", "nonexistant"], []);
    });

    await t.step("parses null array", async () => {
      await sendCommandTest(["BLPOP", "list", 1], null);
    });

    await t.step("transactions work", async () => {
      await sendCommandTest(["MULTI"], "OK");
      await sendCommandTest(["INCR", "FOO"], "QUEUED");
      await sendCommandTest(["INCR", "BAR"], "QUEUED");
      await sendCommandTest(["EXEC"], [1, 1]);
    });

    await flushDB(redisConn);
    redisConn.close();
  },
});

Deno.test({
  name: "pipelineCommands",
  async fn() {
    await SERVER_PROCESS.status();
    const redisConn = await Deno.connect({ port: REDIS_PORT });

    await flushDB(redisConn);

    assertEquals(
      await pipelineCommands(redisConn, [
        ["INCR", "X"],
        ["INCR", "X"],
        ["INCR", "X"],
        ["INCR", "X"],
        ["SET", "hello", "world"],
        ["GET", "hello"],
      ]),
      [1, 2, 3, 4, "OK", "world"],
    );

    await flushDB(redisConn);
    redisConn.close();
  },
});

Deno.test({
  name: "listenReplies",
  async fn() {
    await SERVER_PROCESS.status();
    const redisConn = await Deno.connect({ port: REDIS_PORT });

    await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
    for await (const reply of listenReplies(redisConn)) {
      assertEquals(reply, ["subscribe", "mychannel", 1]);
      await writeCommand(redisConn, ["UNSUBSCRIBE"]);
      break;
    }

    await flushDB(redisConn);
    redisConn.close();
  },
});
