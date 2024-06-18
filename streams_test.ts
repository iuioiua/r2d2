import {
  read,
  RedisClient,
  type RedisCommand,
  RedisError,
  RedisLineStream,
  type RedisReply,
} from "./streams.ts";
import { assertEquals, assertRejects } from "@std/assert";

async function assertReplyEquals(
  input: string[],
  expected: RedisReply,
) {
  const reader = ReadableStream.from(input).getReader();
  const actual = await read(reader);
  assertEquals(actual, expected);
}

async function assertReplyRejects(
  input: string[],
  expected: string,
) {
  const reader = ReadableStream.from(input).getReader();
  await assertRejects(
    async () => await read(reader),
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

Deno.test("read() simple string", async () => {
  await assertReplyEquals(["+OK"], "OK");
});

Deno.test("read() simple error", async () => {
  await assertReplyRejects(["-Error message"], "Error message");
});

Deno.test("read() integer", async () => {
  await assertReplyEquals([":1000\r\n"], 1000);
});

Deno.test("read() bulk string", async () => {
  await assertReplyEquals(["$0", ""], "");
  await assertReplyEquals(["$5", "hello"], "hello");
  await assertReplyEquals(["$-1"], null);
});

Deno.test("read() array", async () => {
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

Deno.test("read() null", async () => {
  await assertReplyEquals(["_"], null);
});

Deno.test("read() boolean", async () => {
  await assertReplyEquals(["#t"], true);
  await assertReplyEquals(["#f"], false);
});

Deno.test("read() double", async () => {
  await assertReplyEquals([",1.23"], 1.23);
  await assertReplyEquals([",inf"], Infinity);
  await assertReplyEquals([",-inf"], -Infinity);
});

Deno.test("read() big number", async () => {
  await assertReplyEquals(
    ["(3492890328409238509324850943850943825024385"],
    3492890328409238509324850943850943825024385n,
  );
  await assertReplyEquals(
    ["(-3492890328409238509324850943850943825024385"],
    -3492890328409238509324850943850943825024385n,
  );
});

Deno.test("read() bulk error", async () => {
  await assertReplyRejects(
    ["!21", "SYNTAX invalid syntax"],
    "SYNTAX invalid syntax",
  );
});

Deno.test("read() verbatim string", async () => {
  await assertReplyEquals(["=15", "txt:Some string"], "txt:Some string");
});

Deno.test("read() map", async () => {
  await assertReplyEquals(["%2", "key1", "$5", "hello", "key2", ":1"], {
    key1: "hello",
    key2: 1,
  });
});

Deno.test("read() set", async () => {
  await assertReplyEquals(
    ["~5", "+orange", "+apple", "#t", ":100", ":999"],
    new Set(["orange", "apple", true, 100, 999]),
  );
});

Deno.test("read() push", async () => {
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

await redisClient.send(["FLUSHALL"]);

async function assertSendEquals(
  command: RedisCommand,
  expected: RedisReply,
): Promise<void> {
  assertEquals<RedisReply>(await redisClient.send(command), expected);
}

Deno.test("RedisClient.send() transactions", async () => {
  await assertSendEquals(["MULTI"], "OK");
  await assertSendEquals(["INCR", "FOO"], "QUEUED");
  await assertSendEquals(["INCR", "BAR"], "QUEUED");
  await assertSendEquals(["EXEC"], [1, 1]);
});

/* Deno.test("redisClient.send() - raw data", async () => {
  const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assertEquals(await redisClient.send(["SET", "binary", data]), "OK");
  assertEquals(await redisClient.send(["GET", "binary"], true), data);
}); */

Deno.test("RedisClient.send() eval script", async () => {
  await assertSendEquals(
    ["EVAL", "return ARGV[1]", 0, "hello"],
    "hello",
  );
});

Deno.test("redisClient.send() Lua script", async () => {
  await assertSendEquals([
    "FUNCTION",
    "LOAD",
    "#!lua name=mylib\nredis.register_function('knockknock', function() return 'Who\\'s there?' end)",
  ], "mylib");
  await assertSendEquals(["FCALL", "knockknock", 0], "Who's there?");
});

Deno.test("redisClient.send() RESP3", async () => {
  await redisClient.send(["HELLO", 3]);
  await assertSendEquals(["HSET", "hash3", "foo", 1, "bar", 2], 2);
  await assertSendEquals(["HGETALL", "hash3"], {
    foo: "1",
    bar: "2",
  });
});

Deno.test("redisClient.send() race condition", async () => {
  async function fn() {
    const key = crypto.randomUUID();
    const value = crypto.randomUUID();
    await redisClient.send(["SET", key, value]);
    const result = await redisClient.send(["GET", key]);
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

Deno.test("redisClient.pipeline()", async () => {
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

Deno.test("redisClient.write() + redisClient.read()", async () => {
  await redisClient.write(["SUBSCRIBE", "mychannel"]);
  const iterator = redisClient.listen();
  assertEquals(await iterator.next(), {
    value: ["subscribe", "mychannel", 1],
    done: false,
  });
  await redisClient.write(["UNSUBSCRIBE"]);
  assertEquals(await iterator.next(), {
    value: ["unsubscribe", "mychannel", 0],
    done: false,
  });
});

Deno.test("redisClient.send() no reply", async () => {
  await assertRejects(
    async () => await redisClient.send(["SHUTDOWN"]),
    RedisError,
    "No reply received",
  );
});

addEventListener("unload", () => redisConn.close());
