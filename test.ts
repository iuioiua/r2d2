import { assertEquals, assertRejects } from "./deps.ts";
import { type Command, type Reply, sendCommand } from "./mod.ts";

/**
 * The server listens on the port defined by the `REDIS_PORT` environment variable.
 * If not defined, port 6379 will be used by default.
 *
 * Exported for use in benchmarks.
 */
export const serverProcess = Deno.run({
  cmd: [
    "redis-server",
    "--daemonize",
    "yes",
    "--port",
    Deno.env.get("REDIS_PORT") ?? "6379",
  ],
  stdin: "null",
  stdout: "null",
});

Deno.test("sendCommand", async (t) => {
  await serverProcess.status();
  const redisConn = await Deno.connect({ port: 6379 });

  async function flushDB() {
    await sendCommand(redisConn, ["FLUSHDB"]);
  }

  async function sendCommandTest(
    command: Command,
    expected: Reply,
  ): Promise<void> {
    assertEquals(await sendCommand(redisConn, command), expected);
  }

  await flushDB();

  await t.step("parses simple string", async () => {
    await sendCommandTest(["PING"], "PONG");
  });

  await t.step("parses error", () => {
    assertRejects(async () => await sendCommand(redisConn, ["helloworld"]));
  });

  await t.step("parses integer", async () => {
    await sendCommandTest(["INCR", "integer"], 1);
    await sendCommandTest(["INCR", "integer"], 2);
  });

  await t.step("parses bulk string", async () => {
    await sendCommand(redisConn, ["SET", "big ups", "west side massive"]);
    await sendCommandTest(["GET", "big ups"], "west side massive");
  });

  await t.step("parses null", async () => {
    await sendCommandTest(["GET", "nonexistant"], null);
  });

  await t.step("parses array", async () => {
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

  await t.step("parses empty array", async () => {
    await sendCommandTest(["HGETALL", "nonexistant"], []);
  });

  await t.step("parses null array", async () => {
    await sendCommandTest(["BLPOP", "list", 1], null);
  });

  await t.step("pipelining works", async () => {
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

  await t.step("transactions work", async () => {
    await sendCommandTest(["MULTI"], "OK");
    await sendCommandTest(["INCR", "FOO"], "QUEUED");
    await sendCommandTest(["INCR", "BAR"], "QUEUED");
    await sendCommandTest(["EXEC"], [1, 1]);
  });

  await flushDB();

  redisConn.close();
});
