# r2d2

Lightweight Redis client library for Deno. Design principles:

- Must be fundamentally simple
- Use native Deno APIs and [Deno's standard library](https://deno.land/std)
  without custom interfaces
- Encourage use of actual Redis commands without intermediate abstractions

## Usage

Must be run with `--allow-net` permission.

### Basic commands

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 }); // Connect to the Redis server

await sendCommand(redisConn, ["SET", "hello", "world"]); // Returns "OK"

await sendCommand(redisConn, ["GET", "hello"]); // Returns "world"

redisConn.close(); // Close the connection to the Redis server
```

If you'd like to ignore the reply.

```ts
await sendCommand(redis, ["SHUTDOWN"], false); // Returns nothing
```

### Pipelining

```ts
import { pipelineCommands } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 }); // Connect to the Redis server

await pipelineCommands(redisConn, [
  ["INCR", "X"],
  ["INCR", "X"],
  ["INCR", "X"],
  ["INCR", "X"],
]);
```

### Pub/sub

```ts
import { listenReplies, writeCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
for await (const [_, channel, message] of listenReplies(redisConn)) {
  // Prints "mychannel" says 1
  console.log(`${channel} says ${message}`);
  await writeCommand(redisConn, ["UNSUBSCRIBE"]);
  break;
}
```

### Single command, no reply

```ts
import { writeCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns nothing
await writeCommand(redisConn, ["SHUTDOWN"]);
```

## Documentation

Check out the documentation
[here](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts).

## Testing

```bash
deno task test
```

> Note: Redis must be installed on your local machine. For installation
> instructions, see [here](https://redis.io/docs/getting-started/installation/).

## Benchmarks

```bash
deno task bench
```

> Note: Redis must be installed on your local machine. For installation
> instructions, see [here](https://redis.io/docs/getting-started/installation/).

## Related

- [redis](https://deno.land/x/redis@v0.26.0) - 🦕 Redis client for Deno 🍕
