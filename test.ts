import { assertEquals, assertRejects } from "./deps.ts";
import {
  type Command,
  listenReplies,
  pipelineCommands,
  type Reply,
  sendCommand,
  sendCommandRawReply,
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

Deno.test("sendCommand parses simple string", async () => {
  await sendCommandTest(["PING"], "PONG");
});

Deno.test("sendCommand parses error", async () => {
  await assertRejects(async () => await sendCommand(redisConn, ["helloworld"]));
});

Deno.test("sendCommand parses integer", async () => {
  await sendCommandTest(["INCR", "integer"], 1);
  await sendCommandTest(["INCR", "integer"], 2);
});

Deno.test("sendCommand parses bulk string", async () => {
  await sendCommand(redisConn, ["SET", "big ups", "west side massive"]);
  await sendCommandTest(["GET", "big ups"], "west side massive");
});

Deno.test("sendCommand parses null", async () => {
  await sendCommandTest(["GET", "nonexistant"], null);
});

Deno.test("sendCommand parses array", async () => {
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

Deno.test("sendCommand parses empty array", async () => {
  await sendCommandTest(["HGETALL", "nonexistant"], []);
});

Deno.test("sendCommand parses null array", async () => {
  await sendCommandTest(["BLPOP", "list", 1], null);
});

Deno.test("sendCommand works with transactions", async () => {
  await sendCommandTest(["MULTI"], "OK");
  await sendCommandTest(["INCR", "FOO"], "QUEUED");
  await sendCommandTest(["INCR", "BAR"], "QUEUED");
  await sendCommandTest(["EXEC"], [1, 1]);
});

Deno.test("sendCommandRawReply works", async () => {
  const value = new Uint8Array([0, 1, 2, 1, 2, 1, 2, 3]);
  await sendCommandTest(["SET", "binary", value], "OK");
  assertEquals(await sendCommandRawReply(redisConn, ["GET", "binary"]), value);
});

Deno.test("sendCommandRawReply throws on non-bulk-string reply", async () => {
  await assertRejects(async () =>
    await sendCommandRawReply(redisConn, ["PING"])
  );
});

Deno.test("pipelineCommands works", async () => {
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

Deno.test("listenReples works", async () => {
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

Deno.test("any fn throws if no reply", async () => {
  await assertRejects(async () => await sendCommand(redisConn, ["SHUTDOWN"]));
});

addEventListener("unload", () => redisConn.close());
