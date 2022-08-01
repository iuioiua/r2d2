import { assertEquals, assertRejects } from "./deps.ts";
import {
  type Command,
  listenReplies,
  pipelineCommands,
  type Reply,
  sendCommand,
  writeCommand,
} from "./mod.ts";
import { close, PORT } from "./_utils.ts";

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
  for await (const reply of listenReplies(redisConn)) {
    assertEquals(reply, ["subscribe", "mychannel", 1]);
    await writeCommand(redisConn, ["UNSUBSCRIBE"]);
    break;
  }
});

addEventListener("unload", async () => await close(redisConn));
