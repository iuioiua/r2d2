import { assertEquals, assertRejects, delay } from "./deps.ts";
import { sendCommand } from "./mod.ts";

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

  await t.step("parses simple string", async () => {
    assertEquals(await sendCommand(redisConn, ["PING"]), "PONG");
  });

  await t.step("parses error", () => {
    assertRejects(async () => await sendCommand(redisConn, ["helloworld"]));
  });

  await t.step("parses integer", async () => {
    await sendCommand(redisConn, ["SET", "integer", 10]);
    assertEquals(await sendCommand(redisConn, ["INCR", "integer"]), 11);
  });

  await t.step("parses bulk string", async () => {
    await sendCommand(redisConn, ["SET", "big ups", "west side massive"]);
    assertEquals(
      await sendCommand(redisConn, ["GET", "big ups"]),
      "west side massive",
    );
  });

  await t.step("parses null", async () => {
    assertEquals(await sendCommand(redisConn, ["GET", "nonexistant"]), null);
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
    assertEquals(
      await sendCommand(redisConn, [
        "HMGET",
        "hash",
        "hello",
        "integer",
        "nonexistant",
      ]),
      ["world", "13", null],
    );
  });

  await t.step("parses empty array", async () => {
    assertEquals(await sendCommand(redisConn, ["HGETALL", "nonexistant"]), []);
  });

  await t.step("parses null array", async () => {
    assertEquals(await sendCommand(redisConn, ["BLPOP", "list", 1]), null);
  });

  serverProcess.close();
  redisConn.close();
});
