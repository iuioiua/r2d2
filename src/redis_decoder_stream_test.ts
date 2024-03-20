import {
  RedisDecoderStream,
  RedisError,
  RedisReply,
} from "./redis_decoder_stream.ts";
import { assertEquals, assertRejects } from "@std/assert";

function createStream(input: string[]) {
  return ReadableStream.from(input)
    .pipeThrough(new RedisDecoderStream());
}

async function assertReplyEquals(
  input: string[],
  expected: RedisReply[],
) {
  const stream = createStream(input);
  const result = await Array.fromAsync(stream);
  assertEquals(result, expected);
}

async function assertReplyRejects(
  input: string[],
  expected: string,
) {
  const stream = createStream(input);
  await assertRejects(
    async () => await Array.fromAsync(stream),
    RedisError,
    expected,
  );
}

Deno.test("RedisDecoderStream simple string", async () => {
  await assertReplyEquals(["+OK"], ["OK"]);
});

Deno.test("RedisDecoderStream simple error", async () => {
  await assertReplyRejects(["-Error message"], "Error message");
});

Deno.test("RedisDecoderStream integer", async () => {
  await assertReplyEquals([":1000\r\n"], [1000]);
});

Deno.test("RedisDecoderStream bulk string", async () => {
  await assertReplyEquals(["$0", ""], [""]);
  await assertReplyEquals(["$5", "hello"], ["hello"]);
  await assertReplyEquals(["$-1"], [null]);
});

Deno.test("RedisDecoderStream null", async () => {
  await assertReplyEquals(["_"], [null]);
});

Deno.test("RedisDecoderStream boolean", async () => {
  await assertReplyEquals(["#t"], [true]);
  await assertReplyEquals(["#f"], [false]);
});

Deno.test("RedisDecoderStream double", async () => {
  await assertReplyEquals([",1.23"], [1.23]);
  await assertReplyEquals([",inf"], [Infinity]);
  await assertReplyEquals([",-inf"], [-Infinity]);
});

Deno.test("RedisDecoderStream big number", async () => {
  await assertReplyEquals(
    ["(3492890328409238509324850943850943825024385"],
    [3492890328409238509324850943850943825024385n],
  );
  await assertReplyEquals(
    ["(-3492890328409238509324850943850943825024385"],
    [-3492890328409238509324850943850943825024385n],
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
  await assertReplyEquals(["*2", "$5", "hello", "$5", "world"], [[
    "hello",
    "world",
  ]]);
  await assertReplyEquals(["*3", ":1", ":2", ":3"], [[1, 2, 3]]);
  /* await assertReplyEquals(
    ["*5", ":1", ":2", ":3", ":4", "$5", "hello"],
    [[1, 2, 3, 4, "hello"]],
  ); */
});

Deno.test("RedisDecoderStream verbatim string", async () => {
  await assertReplyEquals(["=15", "txt:Some string"], [
    "txt:Some string",
  ]);
});
