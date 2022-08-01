# r2d2

[![Docs](https://doc.deno.land/badge.svg)](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)

Lightweight Redis client library for [Deno](https://deno.land/). Design
principles:

- Must be fundamentally simple
- Use native Deno APIs and [Deno's standard library](https://deno.land/std)
  without custom interfaces
- Encourage the use of actual Redis commands without intermediate abstractions

## Usage

Must be run with `--allow-net` permission.

### Send command

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns "OK"
await sendCommand(redisConn, ["SET", "hello", "world"]);

// Returns "world"
await sendCommand(redisConn, ["GET", "hello"]);
```

### Send command (no reply)

```ts
import { writeCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns nothing
await writeCommand(redisConn, ["SHUTDOWN"]);
```

### Raw data

```ts
import {
  sendCommand,
  sendCommandRawReply,
} from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

const value = new Uint8Array([0, 1, 2, 1, 2, 1, 2, 3]);

// Returns "OK"
await sendCommand(redisConn, ["SET", "binary", value]);

// Returns Uint8Array(8) [0, 1, 2, 1, 2, 1, 2, 3]
await sendCommandRawReply(redisConn, ["GET", "binary"]);
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

### Pub/Sub

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

These resources, one way or another, inspired the creation of this module. If
you're one of the authors, thank you.

- [redis](https://deno.land/x/redis) - 🦕 Redis client for Deno 🍕
- [tiny-redis](https://github.com/qingant/tiny-redis) - TinyRedis is a Redis
  server and Redis protocol facilities developed with TypeScript and platformed
  on Deno.
- [Native GET and SET operations on REDIS](https://medium.com/deno-the-complete-reference/native-get-and-set-operations-on-redis-c6cd34df1e90) -
  article with a self-explanatory title.
