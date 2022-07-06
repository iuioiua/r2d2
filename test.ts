import { assertEquals, assertRejects, delay } from "./deps.ts";
import { type Command, type Reply, sendCommand } from "./mod.ts";

/** Exported for use in benchmarks */
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

Deno.test("sendCommand", async (t) => {
  const serverProcess = await createServerProcess();
  const redisConn = await Deno.connect({ port: 6379 });

  async function sendCommandTest(
    command: Command,
    expected: Reply,
  ): Promise<void> {
    assertEquals(await sendCommand(redisConn, command), expected);
  }

  /** Ensure DB is clean */
  async function flushDB(): Promise<void> {
    await sendCommand(redisConn, ["FLUSHDB"]);
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

  await flushDB();
  serverProcess.close();
  redisConn.close();
});
