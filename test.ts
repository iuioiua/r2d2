import { assertEquals, assertRejects } from "@std/assert";
import { Buffer } from "@std/io/buffer";
import { type Command, RedisClient, type Reply } from "./mod.ts";

const encoder = new TextEncoder();

async function readReplyTest(output: string, expected: Reply, raw = false) {
  const redisClient = new RedisClient(new Buffer(encoder.encode(output)));
  const { value } = await redisClient.readReplies(raw).next();
  assertEquals(value, expected);
}

function readReplyRejectTest(output: string, expected: string) {
  const redisClient = new RedisClient(new Buffer(encoder.encode(output)));
  return assertRejects(
    () => redisClient.readReplies().next(),
    expected,
  );
}

Deno.test("readReply() - mixed array", () =>
  readReplyTest("*3\r\n$5\r\nstring\r\n:123\r\n$-1", [
    "string",
    123,
    null,
  ]));

Deno.test("readReply() - empty array", () => readReplyTest("*0\r\n", []));

Deno.test("readReply() - null array", () => readReplyTest("*-1\r\n", null));

Deno.test("readReply() - nested array", () =>
  readReplyTest("*2\r\n*3\r\n:1\r\n$5\r\nhello\r\n:2\r\n#f\r\n", [[
    1,
    "hello",
    2,
  ], false]));

Deno.test("readReply() - attribute", async () => {
  await readReplyTest(
    "|1\r\n+key-popularity\r\n%2\r\n$1\r\na\r\n,0.1923\r\n$1\r\nb\r\n,0.0012\r\n*2\r\n:2039123\r\n:9543892\r\n",
    [2039123, 9543892],
  );
  await readReplyTest("*3\r\n:1\r\n:2\r\n|1\r\n+ttl\r\n:3600\r\n:3\r\n", [
    1,
    2,
    3,
  ]);
});

Deno.test("readReply() - positive big number", () =>
  readReplyTest(
    "(3492890328409238509324850943850943825024385\r\n",
    3492890328409238509324850943850943825024385n,
  ));

Deno.test("readReply() - negative big number", () =>
  readReplyTest(
    "(-3492890328409238509324850943850943825024385\r\n",
    -3492890328409238509324850943850943825024385n,
  ));

Deno.test("readReply() - true boolean", () => readReplyTest("#t\r\n", true));

Deno.test("readReply() - false boolean", () => readReplyTest("#f\r\n", false));

Deno.test("readReply() - integer", () => readReplyTest(":42\r\n", 42));

Deno.test("readReply() - bulk string", () =>
  readReplyTest("$5\r\nhello\r\n", "hello"));

Deno.test("readReply() - emtpy bulk string", () =>
  readReplyTest("$0\r\n\r\n", ""));

Deno.test("readReply() - emtpy raw bulk string", () =>
  readReplyTest("$0\r\n\r\n", new Uint8Array(), true));

Deno.test("readReply() - null bulk string", () =>
  readReplyTest("$-1\r\n", null));

Deno.test("readReply() - blob error", async () => {
  await readReplyRejectTest(
    "!21\r\nSYNTAX invalid syntax\r\n",
    "SYNTAX invalid syntax",
  );
});

Deno.test("readReply() - error", async () => {
  await readReplyRejectTest(
    "-ERR this is the error description\r\n",
    "ERR this is the error description",
  );
});

Deno.test("readReply() - double", () => readReplyTest(",1.23\r\n", 1.23));

Deno.test("readReply() - positive infinity double", () =>
  readReplyTest(",inf\r\n", Infinity));

Deno.test("readReply() - negative infinity double", () =>
  readReplyTest(",-inf\r\n", -Infinity));

Deno.test("readReply() - map", () =>
  readReplyTest("%2\r\n+first\r\n:1\r\n+second\r\n:2\r\n", {
    first: 1,
    second: 2,
  }));

Deno.test("readReply() - null", () => readReplyTest("_\r\n", null));

Deno.test("readReply() - push", () =>
  readReplyTest(
    ">4\r\n+pubsub\r\n+message\r\n+somechannel\r\n+this is the message\r\n",
    ["pubsub", "message", "somechannel", "this is the message"],
  ));

Deno.test("readReply() - set", () =>
  readReplyTest(
    "~5\r\n+orange\r\n+apple\r\n#t\r\n:100\r\n:999\r\n",
    new Set(["orange", "apple", true, 100, 999]),
  ));

Deno.test("readReply() - simple string", () => readReplyTest("+OK\r\n", "OK"));

Deno.test("readReply() - verbatim string", () =>
  readReplyTest("=15\r\ntxt:Some string\r\n", "txt:Some string"));

Deno.test("readReply() - large reply", async () => {
  const reply = "a".repeat(4096 * 2);
  await readReplyTest(`$${reply.length}\r\n${reply}\r\n`, reply);
});

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

await redisClient.sendCommand(["FLUSHALL"]);

async function sendCommandTest(command: Command, expected: Reply) {
  assertEquals(await redisClient.sendCommand(command), expected);
}

Deno.test("RedisClient.sendCommand() - transactions", async () => {
  await sendCommandTest(["MULTI"], "OK");
  await sendCommandTest(["INCR", "FOO"], "QUEUED");
  await sendCommandTest(["INCR", "BAR"], "QUEUED");
  await sendCommandTest(["EXEC"], [1, 1]);
});

Deno.test("RedisClient.sendCommand() - raw data", async () => {
  const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assertEquals(await redisClient.sendCommand(["SET", "binary", data]), "OK");
  assertEquals(await redisClient.sendCommand(["GET", "binary"], true), data);
});

Deno.test("RedisClient.sendCommand() - eval script", () =>
  sendCommandTest(["EVAL", "return ARGV[1]", 0, "hello"], "hello"));

Deno.test("RedisClient.sendCommand() - Lua script", async () => {
  await sendCommandTest([
    "FUNCTION",
    "LOAD",
    "#!lua name=mylib\nredis.register_function('knockknock', function() return 'Who\\'s there?' end)",
  ], "mylib");
  await sendCommandTest(["FCALL", "knockknock", 0], "Who's there?");
});

Deno.test("RedisClient.sendCommand() - RESP3", async () => {
  await redisClient.sendCommand(["HELLO", 3]);
  await sendCommandTest(["HSET", "hash3", "foo", 1, "bar", 2], 2);
  await sendCommandTest(["HGETALL", "hash3"], {
    foo: "1",
    bar: "2",
  });
});

Deno.test("RedisClient.sendCommand() - race condition (#146)", async () => {
  await Promise.all(Array.from({ length: 20 }, async () => {
    const key = crypto.randomUUID();
    const value = crypto.randomUUID();
    await redisClient.sendCommand(["SET", key, value]);
    const result = await redisClient.sendCommand(["GET", key]);
    assertEquals(result, value);
  }));
});

Deno.test("RedisClient.pipelineCommands()", async () => {
  assertEquals(
    await redisClient.pipelineCommands([
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
    ]),
    [1, 2, 3, 4],
  );
});

Deno.test("RedisClient.writeCommand() + RedisClient.readReplies()", async () => {
  await redisClient.writeCommand(["SUBSCRIBE", "mychannel"]);
  const iterator = redisClient.readReplies();
  assertEquals(await iterator.next(), {
    value: ["subscribe", "mychannel", 1],
    done: false,
  });
  await redisClient.writeCommand(["UNSUBSCRIBE"]);
  assertEquals(await iterator.next(), {
    value: ["unsubscribe", "mychannel", 0],
    done: false,
  });
});

Deno.test("RedisClient.sendCommand() - no reply", async () => {
  await assertRejects(
    async () => await redisClient.sendCommand(["SHUTDOWN"]),
    TypeError,
    "No reply received",
  );
});
