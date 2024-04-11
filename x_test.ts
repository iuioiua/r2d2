import {
  readReply,
  type RedisCommand,
  RedisEncoderStream,
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

Deno.test("RedisDecoderStream simple string", async () => {
  await assertReplyEquals(["+OK"], "OK");
});

Deno.test("RedisDecoderStream simple error", async () => {
  await assertReplyRejects(["-Error message"], "Error message");
});

Deno.test("RedisDecoderStream integer", async () => {
  await assertReplyEquals([":1000\r\n"], 1000);
});

Deno.test("RedisDecoderStream bulk string", async () => {
  await assertReplyEquals(["$0", ""], "");
  await assertReplyEquals(["$5", "hello"], "hello");
  await assertReplyEquals(["$-1"], null);
});

Deno.test("RedisDecoderStream null", async () => {
  await assertReplyEquals(["_"], null);
});

Deno.test("RedisDecoderStream boolean", async () => {
  await assertReplyEquals(["#t"], true);
  await assertReplyEquals(["#f"], false);
});

Deno.test("RedisDecoderStream double", async () => {
  await assertReplyEquals([",1.23"], 1.23);
  await assertReplyEquals([",inf"], Infinity);
  await assertReplyEquals([",-inf"], -Infinity);
});

Deno.test("RedisDecoderStream big number", async () => {
  await assertReplyEquals(
    ["(3492890328409238509324850943850943825024385"],
    3492890328409238509324850943850943825024385n,
  );
  await assertReplyEquals(
    ["(-3492890328409238509324850943850943825024385"],
    -3492890328409238509324850943850943825024385n,
  );
});

Deno.test("RedisDecoderStream bulk error", async () => {
  await assertReplyRejects(
    ["!21", "SYNTAX invalid syntax"],
    "SYNTAX invalid syntax",
  );
});

Deno.test("RedisDecoderStream array", async () => {
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

Deno.test("RedisDecoderStream verbatim string", async () => {
  await assertReplyEquals(["=15", "txt:Some string"], "txt:Some string");
});

Deno.test("RedisDecoderStream map", async () => {
  await assertReplyEquals(["%2", "key1", "$5", "hello", "key2", ":1"], {
    key1: "hello",
    key2: 1,
  });
});

Deno.test("RedisDecoderStream set", async () => {
  await assertReplyEquals(
    ["~5", "+orange", "+apple", "#t", ":100", ":999"],
    new Set(["orange", "apple", true, 100, 999]),
  );
});

Deno.test("RedisDecoderStream push", async () => {
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

Deno.test("RedisEncoderStream", async () => {
  const stream = ReadableStream.from<RedisCommand>([
    ["SET", "key", 42],
    ["GET", "key"],
    ["INCR", "counter"],
  ]).pipeThrough(new RedisEncoderStream());
  const actual = await Array.fromAsync(stream);
  const expected = [
    "*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$2\r\n42\r\n",
    "*2\r\n$3\r\nGET\r\n$3\r\nkey\r\n",
    "*2\r\n$4\r\nINCR\r\n$7\r\ncounter\r\n",
  ];
  assertEquals(actual, expected);
});
