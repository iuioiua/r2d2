#!/usr/bin/env -S deno run --allow-net --allow-run
import { sendCommand } from "./mod.ts";

try {
  await Deno.spawn("redis-server", { args: ["--daemonize", "yes"] });
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    console.error(
      "Redis must be installed on your local machine. For installation instructions, see https://redis.io/docs/getting-started/installation/",
    );
  } else {
    throw error;
  }
}

const redisConn = await Deno.connect({ port: 6379 });
console.log("r2d2 client connected to Redis server");
console.log("try 'SET mass 32' then 'INCR mass'");
console.log("exit using ctrl+c");

while (true) {
  const phrase = prompt("redis>");
  if (!phrase) {
    continue;
  }
  const command = phrase.split(" ");
  try {
    const reply = await sendCommand(redisConn, command);
    console.log(reply);
  } catch (error) {
    console.error(error);
  }
}
