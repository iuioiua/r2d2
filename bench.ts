import { connect } from "./deps.ts";

import { pipelineCommands, sendCommand, writeCommand } from "./mod.ts";

const PORT = 6379;

const redisConn = await Deno.connect({ port: PORT });
const redis = await connect({
  hostname: "127.0.0.1",
  port: PORT,
});

Deno.bench({
  name: "r2d2 PING/PONG",
  group: "PING/PONG",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["PING"]);
  },
});

Deno.bench({
  name: "redis PING/PONG",
  group: "PING/PONG",
  async fn() {
    await redis.ping();
  },
});

Deno.bench({
  name: "r2d2 SET/GET",
  group: "SET/GET",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["SET", "mykey", "Hello"]);
    await sendCommand(redisConn, ["GET", "mykey"]);
  },
});

Deno.bench({
  name: "redis SET/GET",
  group: "SET/GET",
  async fn() {
    await redis.set("mykey", "Hello");
    await redis.get("mykey");
  },
});

Deno.bench({
  name: "r2d2 MSET/MGET",
  group: "MSET/MGET",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["MSET", "a", "foo", "b", "bar"]);
    await sendCommand(redisConn, ["MGET", "a", "b"]);
  },
});

Deno.bench({
  name: "redis MSET/MGET",
  group: "MSET/MGET",
  async fn() {
    await redis.mset({ a: "foo", b: "bar" });
    await redis.mget("a", "b");
  },
});

Deno.bench({
  name: "r2d2 pipelining",
  group: "pipelining",
  baseline: true,
  async fn() {
    await pipelineCommands(redisConn, [
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
    ]);
  },
});

Deno.bench({
  name: "r2d2 multiple commands (non-pipelining)",
  group: "pipelining",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["INCR", "X"]);
    await sendCommand(redisConn, ["INCR", "X"]);
    await sendCommand(redisConn, ["INCR", "X"]);
    await sendCommand(redisConn, ["INCR", "X"]);
  },
});

Deno.bench({
  name: "redis pipelining",
  group: "pipelining",
  async fn() {
    const pl = redis.pipeline();
    pl.incr("X");
    pl.incr("X");
    pl.incr("X");
    pl.incr("X");
    await pl.flush();
  },
});

addEventListener("unload", async () => {
  redis.close();
  await writeCommand(redisConn, ["SHUTDOWN"]);
  redisConn.close();
});
