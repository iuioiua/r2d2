import { connect } from "https://deno.land/x/redis@v0.27.1/redis.ts";
import Redis from "npm:ioredis";
import nodeRedis from "npm:redis";

import { pipelineCommands, sendCommand } from "./mod.ts";

const HOSTNAME = "127.0.0.1";
const PORT = 6379;

const redisConn = await Deno.connect({ port: PORT });
const denoRedis = await connect({ hostname: HOSTNAME, port: PORT });
const ioRedis = new Redis({ host: HOSTNAME });
const nodeRedisClient = nodeRedis.createClient({ socket: { host: HOSTNAME } });
await nodeRedisClient.connect();

await sendCommand(redisConn, ["FLUSHALL"]);

Deno.bench({
  name: "r2d2",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["PING"]);

    await sendCommand(redisConn, ["SET", "mykey", "Hello"]);
    await sendCommand(redisConn, ["GET", "mykey"]);

    await sendCommand(redisConn, ["HSET", "hash", "a", "foo", "b", "bar"]);
    await sendCommand(redisConn, ["HGETALL", "hash"]);

    await pipelineCommands(redisConn, [
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
    ]);
  },
});

Deno.bench({
  name: "deno-redis",
  async fn() {
    await denoRedis.ping();

    await denoRedis.set("mykey", "Hello");
    await denoRedis.get("mykey");

    await denoRedis.hset("hash", { a: "foo", b: "bar" });
    await denoRedis.hgetall("hash");

    const pl = denoRedis.pipeline();
    pl.incr("X");
    pl.incr("X");
    pl.incr("X");
    pl.incr("X");
    await pl.flush();
  },
});

Deno.bench({
  name: "ioredis",
  async fn() {
    await ioRedis.ping();

    await ioRedis.set("mykey", "Hello");
    await ioRedis.get("mykey");

    await ioRedis.hset("hash", { a: "foo", b: "bar" });
    await ioRedis.hgetall("hash");

    const pl = ioRedis.pipeline();
    pl.incr("X");
    pl.incr("X");
    pl.incr("X");
    pl.incr("X");
    await pl.exec();
  },
});

Deno.bench({
  name: "node-redis",
  async fn() {
    await nodeRedisClient.ping();

    await nodeRedisClient.set("mykey", "Hello");
    await nodeRedisClient.get("mykey");

    await nodeRedisClient.hSet("hash", "a", "foo", "b", "bar");
    await nodeRedisClient.hGetAll("hash");
  },
});

addEventListener("beforeunload", async () => {
  ioRedis.disconnect();
  await nodeRedisClient.disconnect();
});

addEventListener("unload", () => {
  denoRedis.close();
  redisConn.close();
});
