import {
  readReply,
  RedisClient,
  type RedisCommand,
  RedisError,
  RedisLineStream,
  type RedisReply,
} from "./x.ts";
import { assertEquals, assertRejects } from "@std/assert";

async function assertReplyEquals(
  input: string[],
  expected: RedisReply,
) {
  const reader = ReadableStream.from(input).getReader();
  const actual = await readReply(reader);
  assertEquals(actual, expected);
}

async function assertReplyRejects(
  input: string[],
  expected: string,
) {
  const reader = ReadableStream.from(input).getReader();
  await assertRejects(
    async () => await readReply(reader),
    RedisError,
    expected,
  );
}

Deno.test("RedisLineStream", async () => {
  const stream = ReadableStream.from("hello\r\nworld\r\n\r\n")
    .pipeThrough(new RedisLineStream());

  const result = await Array.fromAsync(stream);
  assertEquals(result, ["hello", "world", ""]);
});

Deno.test("readReply() simple string", async () => {
  await assertReplyEquals(["+OK"], "OK");
});

Deno.test("readReply() simple error", async () => {
  await assertReplyRejects(["-Error message"], "Error message");
});

Deno.test("readReply() integer", async () => {
  await assertReplyEquals([":1000\r\n"], 1000);
});

Deno.test("readReply() bulk string", async () => {
  await assertReplyEquals(["$0", ""], "");
  await assertReplyEquals(["$5", "hello"], "hello");
  await assertReplyEquals(["$-1"], null);
});

Deno.test("readReply() array", async () => {
  await assertReplyEquals(["*-1"], null);
  await assertReplyEquals(["*0"], []);
  await assertReplyEquals(["*2", "$5", "hello", "$5", "world"], [
    "hello",
    "world",
  ]);
  await assertReplyEquals(["*3", ":1", ":2", ":3"], [1, 2, 3]);
  await assertReplyEquals(
    ["*5", ":1", ":2", ":3", ":4", "$5", "hello"],
    [1, 2, 3, 4, "hello"],
  );
});

Deno.test("readReply() null", async () => {
  await assertReplyEquals(["_"], null);
});

Deno.test("readReply() boolean", async () => {
  await assertReplyEquals(["#t"], true);
  await assertReplyEquals(["#f"], false);
});

Deno.test("readReply() double", async () => {
  await assertReplyEquals([",1.23"], 1.23);
  await assertReplyEquals([",inf"], Infinity);
  await assertReplyEquals([",-inf"], -Infinity);
});

Deno.test("readReply() big number", async () => {
  await assertReplyEquals(
    ["(3492890328409238509324850943850943825024385"],
    3492890328409238509324850943850943825024385n,
  );
  await assertReplyEquals(
    ["(-3492890328409238509324850943850943825024385"],
    -3492890328409238509324850943850943825024385n,
  );
});

Deno.test("readReply() bulk error", async () => {
  await assertReplyRejects(
    ["!21", "SYNTAX invalid syntax"],
    "SYNTAX invalid syntax",
  );
});

Deno.test("readReply() verbatim string", async () => {
  await assertReplyEquals(["=15", "txt:Some string"], "txt:Some string");
});

Deno.test("readReply() map", async () => {
  await assertReplyEquals(["%2", "key1", "$5", "hello", "key2", ":1"], {
    key1: "hello",
    key2: 1,
  });
});

Deno.test("readReply() set", async () => {
  await assertReplyEquals(
    ["~5", "+orange", "+apple", "#t", ":100", ":999"],
    new Set(["orange", "apple", true, 100, 999]),
  );
});

Deno.test("readReply() push", async () => {
  await assertReplyEquals([">0"], []);
  await assertReplyEquals([">2", "$5", "hello", "$5", "world"], [
    "hello",
    "world",
  ]);
  await assertReplyEquals([">3", ":1", ":2", ":3"], [1, 2, 3]);
  await assertReplyEquals(
    [">5", ":1", ":2", ":3", ":4", "$5", "hello"],
    [1, 2, 3, 4, "hello"],
  );
});

const HOSTNAME = "127.0.0.1";
const PORT = 6379;
const redisConn = await Deno.connect({ hostname: HOSTNAME, port: PORT });
const redisClient = new RedisClient(redisConn);

await redisClient.sendCommand(["FLUSHALL"]);

async function assertSendCommandEquals(
  command: RedisCommand,
  expected: RedisReply,
): Promise<void> {
  assertEquals<RedisReply>(await redisClient.sendCommand(command), expected);
}

Deno.test("RedisClient.sendCommand() transactions", async () => {
  await assertSendCommandEquals(["MULTI"], "OK");
  await assertSendCommandEquals(["INCR", "FOO"], "QUEUED");
  await assertSendCommandEquals(["INCR", "BAR"], "QUEUED");
  await assertSendCommandEquals(["EXEC"], [1, 1]);
});

Deno.test("RedisClient.sendCommand() eval script", async () => {
  await assertSendCommandEquals(
    ["EVAL", "return ARGV[1]", 0, "hello"],
    "hello",
  );
});

Deno.test("redisClient.sendCommand() Lua script", async () => {
  await assertSendCommandEquals([
    "FUNCTION",
    "LOAD",
    "#!lua name=mylib\nredis.register_function('knockknock', function() return 'Who\\'s there?' end)",
  ], "mylib");
  await assertSendCommandEquals(["FCALL", "knockknock", 0], "Who's there?");
});

Deno.test("redisClient.sendCommand() RESP3", async () => {
  await redisClient.sendCommand(["HELLO", 3]);
  await assertSendCommandEquals(["HSET", "hash3", "foo", 1, "bar", 2], 2);
  await assertSendCommandEquals(["HGETALL", "hash3"], {
    foo: "1",
    bar: "2",
  });
});

Deno.test("redisClient.sendCommand() race condition", async () => {
  async function fn() {
    const key = crypto.randomUUID();
    const value = crypto.randomUUID();
    await redisClient.sendCommand(["SET", key, value]);
    const result = await redisClient.sendCommand(["GET", key]);
    assertEquals(result, value);
  }

  await Promise.all([
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
    fn(),
  ]);
});

Deno.test("redisClient.pipelineCommands()", async () => {
  assertEquals(
    await redisClient.pipeline([
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
    ]),
    [1, 2, 3, 4],
  );
});

/* Deno.test("redisClient.sendCommand() - no reply", async () => {
  await assertRejects(
    async () => await redisClient.sendCommand(["SHUTDOWN"]),
    RedisError,
    "No reply received",
  );
}); */

// addEventListener("unload", () => redisConn.close());
