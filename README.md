# r2d2

Lightweight Redis client library for Deno. Design principles:

- Must be fundamentally simple
- Use native Deno APIs and [Deno's standard library](https://deno.land/std)
  without custom interfaces
- Encourage use of actual Redis commands without intermediate abstractions

## Usage

Must be run with `--allow-net` permission.

### Single command

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns "OK"
await sendCommand(redisConn, ["SET", "hello", "world"]);

// Returns "world"
await sendCommand(redisConn, ["GET", "hello"]);
```

### Single command (no reply)

```ts
import { writeCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns nothing
await writeCommand(redisConn, ["SHUTDOWN"]);
```

### Pipelining

```ts
import { pipelineCommands } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns [1, 2, 3, 4]
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
for await (const reply of listenReplies(redisConn)) {
  // Prints ["subscribe", "mychannel", 1] first iteration
  console.log(reply);
}
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
