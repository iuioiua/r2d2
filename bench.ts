import { pipelineCommands, sendCommand, writeCommand } from "./mod.ts";
import { connect } from "./deps.ts";
import { PORT } from "./test.ts";

const redisConn = await Deno.connect({ port: PORT });
const redis = await connect({
  hostname: "127.0.0.1",
  port: PORT,
});

Deno.bench(
  "r2d2 PING/PONG",
  { group: "PING/PONG", baseline: true },
  async () => {
    await sendCommand(redisConn, ["PING"]);
  },
);

Deno.bench("redis PING/PONG", { group: "PING/PONG" }, async () => {
  await redis.ping();
});

Deno.bench("r2d2 SET/GET", { group: "SET/GET", baseline: true }, async () => {
  await sendCommand(redisConn, ["SET", "mykey", "Hello"]);
  await sendCommand(redisConn, ["GET", "mykey"]);
});

Deno.bench("redis SET/GET", { group: "SET/GET" }, async () => {
  await redis.set("mykey", "Hello");
  await redis.get("mykey");
});

Deno.bench(
  "r2d2 MSET/MGET",
  { group: "MSET/MGET", baseline: true },
  async () => {
    await sendCommand(redisConn, ["MSET", "a", "foo", "b", "bar"]);
    await sendCommand(redisConn, ["MGET", "a", "b"]);
  },
);

Deno.bench("redis MSET/MGET", { group: "MSET/MGET" }, async () => {
  await redis.mset({ a: "foo", b: "bar" });
  await redis.mget("a", "b");
});

Deno.bench(
  "r2d2 pipelining",
  { group: "pipelining", baseline: true },
  async () => {
    await pipelineCommands(redisConn, [
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
      ["INCR", "X"],
    ]);
  },
);

Deno.bench("redis pipelining", { group: "pipelining" }, async () => {
  const pl = redis.pipeline();
  pl.incr("X");
  pl.incr("X");
  pl.incr("X");
  pl.incr("X");
  await pl.flush();
});

addEventListener("unload", async () => {
  redis.close();
  await writeCommand(redisConn, ["SHUTDOWN"]);
  redisConn.close();
  await close(redisConn);
});
