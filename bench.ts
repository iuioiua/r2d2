import { sendCommand } from "./mod.ts";
import { createServerProcess } from "./test.ts";
import { connect } from "./deps.ts";

await createServerProcess();
const redisConn = await Deno.connect({ port: 6379 });
const redis = await connect({
  hostname: "127.0.0.1",
  port: 6379,
});

Deno.bench({
  name: "r2d2: PING",
  group: "PING",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["PING"]);
  },
});

Deno.bench({
  name: "deno-redis: PING",
  group: "PING",
  async fn() {
    await redis.ping();
  },
});

Deno.bench({
  name: "r2d2: SET and GET",
  group: "SET and GET",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["SET", "mykey", "Hello"]);
    await sendCommand(redisConn, ["GET", "mykey"]);
  },
});

Deno.bench({
  name: "deno-redis: SET and GET",
  group: "SET and GET",
  async fn() {
    await redis.sendCommand("SET", "mykey", "Hello");
    await redis.sendCommand("GET", "mykey");
  },
});

Deno.bench({
  name: "r2d2: MSET and MGET",
  group: "MSET and MGET",
  baseline: true,
  async fn() {
    await sendCommand(redisConn, ["MSET", "a", "foo", "b", "bar"]);
    await sendCommand(redisConn, ["MGET", "a", "b"]);
  },
});

Deno.bench({
  name: "deno-redis: MSET and MGET",
  group: "MSET and MGET",
  async fn() {
    await redis.mset({ a: "foo", b: "bar" });
    await redis.mget("a", "b");
  },
});
