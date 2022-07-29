import { sendCommand, writeCommand } from "./mod.ts";
import { connect } from "./deps.ts";

const REDIS_PORT = 6379;

const redisConn = await Deno.connect({ port: REDIS_PORT });
const redis = await connect({
  hostname: "127.0.0.1",
  port: REDIS_PORT,
});

Deno.bench("r2d2", { baseline: true }, async () => {
  await sendCommand(redisConn, ["PING"]);

  await sendCommand(redisConn, ["SET", "mykey", "Hello"]);
  await sendCommand(redisConn, ["GET", "mykey"]);

  await sendCommand(redisConn, ["MSET", "a", "foo", "b", "bar"]);
  await sendCommand(redisConn, ["MGET", "a", "b"]);
});

Deno.bench("redis", async () => {
  await redis.ping();

  await redis.set("mykey", "Hello");
  await redis.get("mykey");

  await redis.mset({ a: "foo", b: "bar" });
  await redis.mget("a", "b");
});

globalThis.addEventListener("unload", async () => {
  redisConn.close();
  await writeCommand(redisConn, ["SHUTDOWN"]);
  redis.close();
});
