import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.160.0/testing/asserts.ts";
import { StringReader } from "https://deno.land/std@0.160.0/io/readers.ts";
import { StringWriter } from "https://deno.land/std@0.160.0/io/writers.ts";
import { BufReader } from "https://deno.land/std@0.160.0/io/buffer.ts";

import {
  type Command,
  listenReplies,
  pipelineCommands,
  readReply,
  type Reply,
  sendCommand,
  writeCommand,
} from "./mod.ts";

/**
 * Sections:
 * 1. Request
 * 2. Reply
 * 3. Combined
 */

/** 1. Request */

Deno.test("write command", async () => {
  const writer = new StringWriter();
  await writeCommand(writer, ["LLEN", "mylist", 42]);
  assertEquals(
    writer.toString(),
    "*3\r\n$4\r\nLLEN\r\n$6\r\nmylist\r\n$2\r\n42\r\n",
  );
});

/** 2. Reply */

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

Deno.test("attribute", async () => {
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

Deno.test("boolean", async () => {
  await readReplyTest("#t\r\n", true);
  await readReplyTest("#f\r\n", false);
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

Deno.test("blob error", async () => {
  await readReplyRejectTest(
    "!21\r\nSYNTAX invalid syntax\r\n",
    "SYNTAX invalid syntax",
  );
});

Deno.test("error", async () => {
  await readReplyRejectTest(
    "-ERR this is the error description\r\n",
    "ERR this is the error description",
  );
});

Deno.test("double", async () => {
  await readReplyTest(",1.23\r\n", 1.23);
  await readReplyTest(",inf\r\n", Infinity);
  await readReplyTest(",-inf\r\n", -Infinity);
});

Deno.test("map", async () => {
  await readReplyTest("%2\r\n+first\r\n:1\r\n+second\r\n:2\r\n", {
    first: 1,
    second: 2,
  });
});

Deno.test("null", async () => {
  await readReplyTest("_\r\n", null);
});

Deno.test("push", async () => {
  await readReplyTest(
    ">4\r\n+pubsub\r\n+message\r\n+somechannel\r\n+this is the message\r\n",
    ["pubsub", "message", "somechannel", "this is the message"],
  );
});

Deno.test("set", async () => {
  await readReplyTest(
    "~5\r\n+orange\r\n+apple\r\n#t\r\n:100\r\n:999\r\n",
    new Set(["orange", "apple", true, 100, 999]),
  );
});

Deno.test("simple string", async () => {
  await readReplyTest("+OK\r\n", "OK");
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
  await readReplyTest(
    "~?\r\n+a\r\n:1\r\n+b\r\n:2\r\n.\r\n",
    new Set(["a", 1, "b", 2]),
  );
});

Deno.test("streamed map", async () => {
  await readReplyTest("%?\r\n+a\r\n:1\r\n+b\r\n:2\r\n.\r\n", { a: 1, b: 2 });
});

Deno.test("verbatim string", async () => {
  await readReplyTest("=15\r\ntxt:Some string\r\n", "txt:Some string");
});

/** 3. Combined */

const HOSTNAME = "localhost";
const PORT = 6379;
const redisConn = await Deno.connect({ hostname: HOSTNAME, port: PORT });

async function sendCommandTest(
  command: Command,
  expected: Reply,
): Promise<void> {
  assertEquals(await sendCommand(redisConn, command), expected);
}

Deno.test("transactions", async () => {
  await sendCommandTest(["MULTI"], "OK");
  await sendCommandTest(["INCR", "FOO"], "QUEUED");
  await sendCommandTest(["INCR", "BAR"], "QUEUED");
  await sendCommandTest(["EXEC"], [1, 1]);
});

Deno.test("pipelining", async () => {
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

Deno.test("write-only and listening", async () => {
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

/** This test must be last */
Deno.test("reject on no reply", async () => {
  await assertRejects(async () => await sendCommand(redisConn, ["SHUTDOWN"]));
});

addEventListener("unload", () => redisConn.close());
