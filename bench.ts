import { sendCommand } from "./mod.ts";
import { createServerProcess } from "./test.ts";
import { connect } from "./deps.ts";

await createServerProcess();
const redisConn = await Deno.connect({ port: 6379 });
const redis = await connect({
  hostname: "127.0.0.1",
  port: 6379,
});

Deno.bench("r2d2", { baseline: true }, async () => {
  await sendCommand(redisConn, ["PING"]);

  await sendCommand(redisConn, ["SET", "mykey", "Hello"]);
  await sendCommand(redisConn, ["GET", "mykey"]);

  await sendCommand(redisConn, ["MSET", "a", "foo", "b", "bar"]);
  await sendCommand(redisConn, ["MGET", "a", "b"]);
});

Deno.bench("deno-redis", async () => {
  await redis.ping();

  await redis.set("mykey", "Hello");
  await redis.get("mykey");

  await redis.mset({ a: "foo", b: "bar" });
  await redis.mget("a", "b");
  },
});
