import * as denoRedis from "https://deno.land/x/redis@v0.32.2/mod.ts";
import { Redis } from "npm:ioredis@5.3.2";
import { createClient } from "npm:redis@4.6.13";
import { RedisClient } from "./mod.ts";
import { RedisClient as RedisStreamClient } from "./streams.ts";

const HOSTNAME = "127.0.0.1";
const PORT = 6379;

const redisConn = await Deno.connect({ hostname: HOSTNAME, port: PORT });
const redisClient = new RedisClient(redisConn);

const redisStreamConn = await Deno.connect({ hostname: HOSTNAME, port: PORT });
const redisStreamClient = new RedisStreamClient(redisStreamConn);
const denoRedisConn = await denoRedis.connect({
  hostname: HOSTNAME,
  port: PORT,
});
const ioRedis = new Redis();

const nodeRedisClient = await createClient().connect();

Deno.bench({
  name: "r2d2",
  baseline: true,
  group: "PING",
  async fn() {
    await redisClient.sendCommand(["PING"]);
  },
});

Deno.bench({
  name: "r2d2 (stream)",
  group: "PING",
  async fn() {
    await redisStreamClient.send(["PING"]);
  },
});

Deno.bench({
  name: "deno-redis",
  group: "PING",
  async fn() {
    await denoRedisConn.ping();
  },
});

Deno.bench({
  name: "npm:ioredis",
  group: "PING",
  async fn() {
    await ioRedis.ping();
  },
});

Deno.bench({
  name: "npm:redis",
  group: "PING",
  async fn() {
    await nodeRedisClient.ping();
  },
});

Deno.bench({
  name: "r2d2",
  baseline: true,
  group: "SET/GET",
  async fn() {
    await redisClient.sendCommand(["SET", "mykey", "Hello"]);
    await redisClient.sendCommand(["GET", "mykey"]);
  },
});

Deno.bench({
  name: "r2d2 (stream)",
  group: "SET/GET",
  async fn() {
    await redisStreamClient.send(["SET", "mykey", "Hello"]);
    await redisStreamClient.send(["GET", "mykey"]);
  },
});

Deno.bench({
  name: "deno-redis",
  group: "SET/GET",
  async fn() {
    await denoRedisConn.set("mykey", "Hello");
    await denoRedisConn.get("mykey");
  },
});

Deno.bench({
  name: "npm:ioredis",
  group: "SET/GET",
  async fn() {
    await ioRedis.set("mykey", "Hello");
    await ioRedis.get("mykey");
  },
});

Deno.bench({
  name: "npm:redis",
  group: "SET/GET",
  async fn() {
    await nodeRedisClient.set("mykey", "Hello");
    await nodeRedisClient.get("mykey");
  },
});

/* Deno.bench({
  name: "r2d2",
  baseline: true,
  async fn() {
    await redisClient.sendCommand(["PING"]);

    await redisClient.sendCommand(["SET", "mykey", "Hello"]);
    await redisClient.sendCommand(["GET", "mykey"]);

    await redisClient.sendCommand(["HSET", "hash", "a", "foo", "b", "bar"]);
    await redisClient.sendCommand(["HGETALL", "hash"]);

    await redisClient.pipelineCommands([
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
    ]);
  },
});

Deno.bench({
  name: "r2d2 x",
  baseline: true,
  async fn() {
    await redisStreamClient.send(["PING"]);

    await redisStreamClient.send(["SET", "mykey", "Hello"]);
    await redisStreamClient.send(["GET", "mykey"]);

    await redisStreamClient.send(["HSET", "hash", "a", "foo", "b", "bar"]);
    await redisStreamClient.send(["HGETALL", "hash"]);

    await redisStreamClient.pipeline([
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
    await denoRedisConn.ping();

    await denoRedisConn.set("mykey", "Hello");
    await denoRedisConn.get("mykey");

    await denoRedisConn.hset("hash", { a: "foo", b: "bar" });
    await denoRedisConn.hgetall("hash");

    const pl = denoRedisConn.pipeline();
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

    await nodeRedisClient.incr("X");
    await nodeRedisClient.incr("X");
    await nodeRedisClient.incr("X");
    await nodeRedisClient.incr("X");
  },
}); */

addEventListener("beforeunload", async () => {
  ioRedis.disconnect();
  await nodeRedisClient.disconnect();
});

addEventListener("unload", () => {
  denoRedisConn.close();
  redisConn.close();
});
