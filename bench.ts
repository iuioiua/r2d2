import { connect } from "https://deno.land/x/redis@v0.29.0/mod.ts";
import { Redis } from "npm:ioredis@5.3.0";
import nodeRedis from "npm:redis@4.6.4";

import { pipelineCommands, sendCommand } from "./mod.ts";

const HOSTNAME = "127.0.0.1";
const PORT = 6379;

const redisConn = await Deno.connect({ hostname: HOSTNAME, port: PORT });
const denoRedis = await connect({ hostname: HOSTNAME, port: PORT });
const ioRedis = new Redis();

const nodeRedisClient = nodeRedis.createClient({ socket: { host: HOSTNAME } });
await nodeRedisClient.connect();

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
  name: "npm:ioredis",
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
  name: "npm:redis",
  async fn() {
    await nodeRedisClient.ping();

    await nodeRedisClient.set("mykey", "Hello");
    await nodeRedisClient.get("mykey");

    await nodeRedisClient.hSet("hash", { a: "foo", b: "bar" });
    await nodeRedisClient.hGetAll("hash");

    /** Autopipelining */
    await nodeRedisClient.incr("X");
    await nodeRedisClient.incr("X");
    await nodeRedisClient.incr("X");
    await nodeRedisClient.incr("X");
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
