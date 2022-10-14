import { assertRejects } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { assertEquals, BufReader, StringReader } from "../deps.ts";
import { readReply, type Reply } from "./reply.ts";

async function readReplyTest(output: string, expected: Reply) {
  assertEquals(
    await readReply(new BufReader(new StringReader(output))),
    expected,
  );
}

async function readReplyRejectTest(output: string, expected: string) {
  await assertRejects(
    async () => await readReply(new BufReader(new StringReader(output))),
    expected,
  );
}

/** RESP v2 */

Deno.test("simple string", async () => {
  await readReplyTest("+OK\r\n", "OK");
});

Deno.test("integer", async () => {
  await readReplyTest(":42\r\n", 42);
});

Deno.test("bulk string", async () => {
  await readReplyTest("$5\r\nhello\r\n", "hello");
  /** Empty bulk string */
  await readReplyTest("$0\r\n\r\n", "");
  /** Null bulk string */
  await readReplyTest("$-1\r\n", null);
});

Deno.test("array", async () => {
  await readReplyTest("*2\r\n$5\r\nhello\r\n$5\r\nworld\r\n", [
    "hello",
    "world",
  ]);
  await readReplyTest("*3\r\n:1\r\n:2\r\n:3\r\n", [1, 2, 3]);
  /** Empty array */
  await readReplyTest("*0\r\n", []);
  /** Null array */
  await readReplyTest("*-1\r\n", null);
  /** Null elements in array */
  await readReplyTest("*3\r\n$5\r\nhello\r\n$-1\r\n$5\r\nworld\r\n", [
    "hello",
    null,
    "world",
  ]);
  /** Nested array */
  await readReplyTest("*2\r\n*3\r\n:1\r\n$5\r\nhello\r\n:2\r\n#f\r\n", [[
    1,
    "hello",
    2,
  ], false]);
});

Deno.test("simple error", async () => {
  await readReplyRejectTest(
    "-ERR this is the error description\r\n",
    "this is the error description",
  );
});

/** RESP3 */

Deno.test("null", async () => {
  await readReplyTest("_\r\n", null);
});

Deno.test("boolean", async () => {
  await readReplyTest("#t\r\n", true);
  await readReplyTest("#f\r\n", false);
});

Deno.test("double", async () => {
  await readReplyTest(",1.23\r\n", 1.23);
  await readReplyTest(",inf\r\n", Infinity);
  await readReplyTest(",-inf\r\n", -Infinity);
});

Deno.test("blob error", async () => {
  await readReplyRejectTest(
    "!21\r\nSYNTAX invalid syntax\r\n",
    "SYNTAX invalid syntax",
  );
});

Deno.test("verbatim string", async () => {
  await readReplyTest("=15\r\ntxt:Some string\r\n", "txt:Some string");
});

Deno.test("big number", async () => {
  await readReplyTest(
    "(3492890328409238509324850943850943825024385\r\n",
    3492890328409238509324850943850943825024385n,
  );
  await readReplyTest(
    "(-3492890328409238509324850943850943825024385\r\n",
    -3492890328409238509324850943850943825024385n,
  );
});

Deno.test("map", async () => {
  await readReplyTest("%2\r\n+first\r\n:1\r\n+second\r\n:2\r\n", {
    first: 1,
    second: 2,
  });
});

Deno.test("set", async () => {
  await readReplyTest(
    "~5\r\n+orange\r\n+apple\r\n#t\r\n:100\r\n:999\r\n",
    new Set(["orange", "apple", true, 100, 999]),
  );
});

Deno.test("streamed string", async () => {
  await readReplyTest(
    "$?\r\n;4\r\nHell\r\n;5\r\no wor\r\n;1\r\nd\r\n;0\r\n",
    "Hello word",
  );
});

/** @todo test more complex case */
Deno.test("streamed array", async () => {
  await readReplyTest("*?\r\n:1\r\n:2\r\n:3\r\n.\r\n", [1, 2, 3]);
});

Deno.test("streamed set", async () => {
  await readReplyTest("~?\r\n+a\r\n:1\r\n+b\r\n:2\r\n.\r\n", new Set(["a", 1, "b", 2]));
});
