import {
  afterAll,
  assertEquals,
  assertRejects,
  beforeAll,
  beforeEach,
  delay,
  it,
} from "./deps.ts";
import { type Command, type Reply, sendCommand } from "./mod.ts";

export async function createServerProcess(): Promise<Deno.Process> {
  /** The server listens on port 6379 by default */
  const serverProcess = Deno.run({
    cmd: ["redis-server"],
    stdin: "null",
    stdout: "null",
  });
  /** Let the server breathe for a second before connecting */
  await delay(1_000);
  return serverProcess;
}

let conn: Deno.Conn;
let serverProcess: Deno.Process;

/** The server listens on port 6379 by default */
beforeAll(async () => {
  serverProcess = await createServerProcess();
  conn = await Deno.connect({ port: 6379 });
});

afterAll(() => {
  conn.close();
  serverProcess.close();
});

beforeEach(async () => {
  await sendCommand(conn, ["FLUSHDB"]);
});

async function assertReplyEquals(
  command: Command,
  expected: Reply,
): Promise<void> {
  await assertEquals(await sendCommand(conn, command), expected);
}

/**
 * Group: String
 */

/**
 * @see https://redis.io/commands/append/
 */
it("APPEND", async () => {
  await assertReplyEquals(["EXISTS", "mykey"], 0);
  await assertReplyEquals(["APPEND", "mykey", "Hello"], 5);
  await assertReplyEquals(["APPEND", "mykey", " World"], 11);
  await assertReplyEquals(["GET", "mykey"], "Hello World");

  await assertReplyEquals(["APPEND", "ts", "0043"], 4);
  await assertReplyEquals(["APPEND", "ts", "0035"], 8);
  await assertReplyEquals(["GETRANGE", "ts", 0, 3], "0043");
  await assertReplyEquals(["GETRANGE", "ts", 4, 7], "0035");
});

/**
 * @see https://redis.io/commands/decr/
 */
it("DECR", async () => {
  await assertReplyEquals(["SET", "mykey", "10"], "OK");
  await assertReplyEquals(["DECR", "mykey"], 9);
  await assertReplyEquals(
    ["SET", "mykey", "234293482390480948029348230948"],
    "OK",
  );
  assertRejects(async () => await sendCommand(conn, ["DECR", "mykey"]));
});

/**
 * @see https://redis.io/commands/decrby/
 */
it("DECRBY", async () => {
  await assertReplyEquals(["SET", "mykey", "10"], "OK");
  await assertReplyEquals(["DECRBY", "mykey", 3], 7);
});

/**
 * @see https://redis.io/commands/get/
 */
it("GET", async () => {
  await assertReplyEquals(["GET", "nonexisting"], null);
  await assertReplyEquals(["SET", "mykey", "Hello"], "OK");
  await assertReplyEquals(["GET", "mykey"], "Hello");
});

/**
 * @see https://redis.io/commands/getdel/
 */
it("GETDEL", async () => {
  await assertReplyEquals(["SET", "mykey", "Hello"], "OK");
  await assertReplyEquals(["GETDEL", "mykey"], "Hello");
  await assertReplyEquals(["GET", "mykey"], null);
});

/**
 * @see https://redis.io/commands/getex/
 */
it("GETEX", async () => {
  await assertReplyEquals(["SET", "mykey", "Hello"], "OK");
  await assertReplyEquals(["GETEX", "mykey"], "Hello");
  await assertReplyEquals(["TTL", "mykey"], -1);
  await assertReplyEquals(["GETEX", "mykey", "EX", 60], "Hello");
  await assertReplyEquals(["TTL", "mykey"], 60);
});

/**
 * @see https://redis.io/commands/getrange/
 */
it("GETRANGE", async () => {
  await assertReplyEquals(["SET", "mykey", "This is a string"], "OK");
  await assertReplyEquals(["GETRANGE", "mykey", 0, 3], "This");
  await assertReplyEquals(["GETRANGE", "mykey", -3, -1], "ing");
  await assertReplyEquals(["GETRANGE", "mykey", 0, -1], "This is a string");
  await assertReplyEquals(["GETRANGE", "mykey", 10, 100], "string");
});

/**
 * @see https://redis.io/commands/getset/
 */
it("GETSET", async () => {
  await assertReplyEquals(["INCR", "mycounter"], 1);
  await assertReplyEquals(["GETSET", "mycounter", "0"], "1");
  await assertReplyEquals(["GET", "mycounter"], "0");

  await assertReplyEquals(["SET", "mykey", "Hello"], "OK");
  await assertReplyEquals(["GETSET", "mykey", "World"], "Hello");
  await assertReplyEquals(["GET", "mykey"], "World");
});

/**
 * @see https://redis.io/commands/incr/
 */
it("INCR", async () => {
  await assertReplyEquals(["SET", "mykey", "10"], "OK");
  await assertReplyEquals(["INCR", "mykey"], 11);
  await assertReplyEquals(["GET", "mykey"], "11");
});

/**
 * @see https://redis.io/commands/incrby/
 */
it("INCRBY", async () => {
  await assertReplyEquals(["SET", "mykey", "10"], "OK");
  await assertReplyEquals(["INCRBY", "mykey", 5], 15);
});

/**
 * @see https://redis.io/commands/incrbyfloat/
 */
it("INCRBYFLOAT", async () => {
  await assertReplyEquals(["SET", "mykey", 10.50], "OK");
  await assertReplyEquals(["INCRBYFLOAT", "mykey", 0.1], "10.6");
  await assertReplyEquals(["INCRBYFLOAT", "mykey", -5], "5.6");
  await assertReplyEquals(["SET", "mykey", 5.0e3], "OK");
  await assertReplyEquals(["INCRBYFLOAT", "mykey", 2.0e2], "5200");
});

/**
 * @todo
 * @see https://redis.io/commands/lcs/
 */

/**
 * @see https://redis.io/commands/mget/
 */
it("MGET", async () => {
  await assertReplyEquals(["SET", "key1", "Hello"], "OK");
  await assertReplyEquals(["SET", "key2", "World"], "OK");
  await assertReplyEquals(["MGET", "key1", "key2", "nonexisting"], [
    "Hello",
    "World",
    null,
  ]);
});

/**
 * @see https://redis.io/commands/mset/
 */
it("MSET", async () => {
  await assertReplyEquals(["MSET", "key1", "Hello", "key2", "World"], "OK");
  await assertReplyEquals(["GET", "key1"], "Hello");
  await assertReplyEquals(["GET", "key2"], "World");
});

/**
 * @see https://redis.io/commands/msetnx/
 */
it("MSETNX", async () => {
  await assertReplyEquals(["MSETNX", "key1", "Hello", "key2", "there"], 1);
  await assertReplyEquals(["MSETNX", "key2", "new", "key3", "world"], 0);
  await assertReplyEquals(["MGET", "key1", "key2", "key3"], [
    "Hello",
    "there",
    null,
  ]);
});

/**
 * @todo
 * @see https://redis.io/commands/psetex/
 */

/**
 * @see https://redis.io/commands/set/
 */
it("SET", async () => {
  await assertReplyEquals(["SET", "mykey", "Hello"], "OK");
  await assertReplyEquals(["GET", "mykey"], "Hello");
  await assertReplyEquals(
    ["SET", "anotherkey", "will expire in a minute", "EX", 60],
    "OK",
  );
});

/**
 * @see https://redis.io/commands/setex/
 */
it("SETEX", async () => {
  await assertReplyEquals(["SETEX", "mykey", 10, "Hello"], "OK");
  await assertReplyEquals(["TTL", "mykey"], 10);
  await assertReplyEquals(["GET", "mykey"], "Hello");
});

/**
 * @see https://redis.io/commands/setnx/
 */
it("SETNX", async () => {
  await assertReplyEquals(["SETNX", "mykey", "Hello"], 1);
  await assertReplyEquals(["SETNX", "mykey", "World"], 0);
  await assertReplyEquals(["GET", "mykey"], "Hello");
});

/**
 * @see https://redis.io/commands/setrange/
 */
it("SETRANGE", async () => {
  await assertReplyEquals(["SET", "key1", "Hello World"], "OK");
  await assertReplyEquals(["SETRANGE", "key1", 6, "Redis"], 11);
  await assertReplyEquals(["GET", "key1"], "Hello Redis");

  /** @todo */
  // await assertReplyEquals(["SETRANGE", "key2", 6, "Redis"], 11);
  // await assertReplyEquals(["GET", "key2"], "Redis");
});

/**
 * @see https://redis.io/commands/strlen/
 */
it("STRLEN", async () => {
  await assertReplyEquals(["SET", "mykey", "Hello world"], "OK");
  await assertReplyEquals(["STRLEN", "mykey"], 11);
  await assertReplyEquals(["STRLEN", "nonexisting"], 0);
});

/**
 * @see https://redis.io/commands/substr/
 */
it("SUBSTR", async () => {
  await assertReplyEquals(["SET", "mykey", "This is a string"], "OK");
  await assertReplyEquals(["GETRANGE", "mykey", 0, 3], "This");
  await assertReplyEquals(["GETRANGE", "mykey", -3, -1], "ing");
  await assertReplyEquals(["GETRANGE", "mykey", 0, -1], "This is a string");
  await assertReplyEquals(["GETRANGE", "mykey", 10, 100], "string");
});

/**
 * Group: Hash
 */

/**
 * @see https://redis.io/commands/hdel/
 */
it("HSET", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "foo"], 1);
  await assertReplyEquals(["HDEL", "myhash", "field1"], 1);
  await assertReplyEquals(["HDEL", "myhash", "field2"], 0);
});

/**
 * @see https://redis.io/commands/hexists/
 */
it("HEXISTS", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "foo"], 1);
  await assertReplyEquals(["HEXISTS", "myhash", "field1"], 1);
  await assertReplyEquals(["HEXISTS", "myhash", "field2"], 0);
});

/**
 * @see https://redis.io/commands/hget/
 */
it("HGET", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "foo"], 1);
  await assertReplyEquals(["HGET", "myhash", "field1"], "foo");
  await assertReplyEquals(["HGET", "myhash", "field2"], null);
});

/**
 * @see https://redis.io/commands/hgetall/
 */
it("HGETALL", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "Hello"], 1);
  await assertReplyEquals(["HSET", "myhash", "field2", "World"], 1);
  await assertReplyEquals(["HGETALL", "myhash"], [
    "field1",
    "Hello",
    "field2",
    "World",
  ]);
});

/**
 * @see https://redis.io/commands/hincrby/
 */
it("HINCRBY", async () => {
  await assertReplyEquals(["HSET", "myhash", "field", 5], 1);
  await assertReplyEquals(["HINCRBY", "myhash", "field", 1], 6);
  await assertReplyEquals(["HINCRBY", "myhash", "field", -1], 5);
  await assertReplyEquals(["HINCRBY", "myhash", "field", -10], -5);
});

/**
 * @see https://redis.io/commands/hincrbyfloat/
 */
it("HINCRBYFLOAT", async () => {
  await assertReplyEquals(["HSET", "myhash", "field", 10.50], 1);
  await assertReplyEquals(["HINCRBYFLOAT", "myhash", "field", 0.1], "10.6");
  await assertReplyEquals(["HSET", "myhash", "field", 5.0e3], 0);
  await assertReplyEquals(["HINCRBYFLOAT", "myhash", "field", 2.0e2], "5200");
});

/**
 * @see https://redis.io/commands/hkeys/
 */
it("HKEYS", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "Hello"], 1);
  await assertReplyEquals(["HSET", "myhash", "field2", "World"], 1);
  await assertReplyEquals(["HKEYS", "myhash"], ["field1", "field2"]);
});

/**
 * @see https://redis.io/commands/hlen/
 */
it("HLEN", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "Hello"], 1);
  await assertReplyEquals(["HSET", "myhash", "field2", "World"], 1);
  await assertReplyEquals(["HLEN", "myhash"], 2);
});

/**
 * @see https://redis.io/commands/hmget/
 */
it("HMGET", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "Hello"], 1);
  await assertReplyEquals(["HSET", "myhash", "field2", "World"], 1);
  await assertReplyEquals(["HMGET", "myhash", "field1", "field2", "nofield"], [
    "Hello",
    "World",
    null,
  ]);
});

/**
 * @see https://redis.io/commands/hmset/
 */
it("HMSET", async () => {
  await assertReplyEquals([
    "HMSET",
    "myhash",
    "field1",
    "Hello",
    "field2",
    "World",
  ], "OK");
  await assertReplyEquals(["HGET", "myhash", "field1"], "Hello");
  await assertReplyEquals(["HGET", "myhash", "field2"], "World");
});

/**
 * @todo
 * @see https://redis.io/commands/hrandfield/
 */
/** it("HRANDFIELD", async () => {
  await assertReplyEquals([
    "HMSET",
    "coin",
    "heads",
    "obverse",
    "tails",
    "reverse",
    "edge",
    "null",
  ], "OK");
  await assertReplyEquals(["HRANDFIELD", "coin"], "heads");
  await assertReplyEquals(["HRANDFIELD", "coin"], "heads");
  await assertReplyEquals(["HRANDFIELD", "coin", -5, "WITHVALUES"], [
    "edge",
    "null",
    "tails",
    "reverse",
    "edge",
    "null",
    "tails",
    "reverse",
    "tails",
    "reverse",
  ]);
}); */

/**
 * @see https://redis.io/commands/hset/
 */
it("HSET", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "Hello"], 1);
  await assertReplyEquals(["HGET", "myhash", "field1"], "Hello");
});

/**
 * @see https://redis.io/commands/hsetnx/
 */
it("HSETNX", async () => {
  await assertReplyEquals(["HSETNX", "myhash", "field", "Hello"], 1);
  await assertReplyEquals(["HSETNX", "myhash", "field", "World"], 0);
  await assertReplyEquals(["HGET", "myhash", "field"], "Hello");
});

/**
 * @see https://redis.io/commands/hstrlen/
 */
it("HSTRLEN", async () => {
  await assertReplyEquals([
    "HMSET",
    "myhash",
    "f1",
    "HelloWorld",
    "f2",
    99,
    "f3",
    -256,
  ], "OK");
  await assertReplyEquals(["HSTRLEN", "myhash", "f1"], 10);
  await assertReplyEquals(["HSTRLEN", "myhash", "f2"], 2);
  await assertReplyEquals(["HSTRLEN", "myhash", "f3"], 4);
});

/**
 * @see https://redis.io/commands/hvals/
 */
it("HVALS", async () => {
  await assertReplyEquals(["HSET", "myhash", "field1", "Hello"], 1);
  await assertReplyEquals(["HSET", "myhash", "field2", "World"], 1);
  await assertReplyEquals(["HVALS", "myhash"], ["Hello", "World"]);
});
