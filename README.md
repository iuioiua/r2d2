# r2d2

Simple, lightweight Redis client library for Deno.

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

/** Resolves to "OK" */
await sendCommand(redisConn, ["SET", "hello", "world"]);

/** Prints "world" */
console.log(await sendCommand(redisConn, ["GET", "hello"]));

redisConn.close();
```

If you'd like to ignore the reply.

```ts
await sendCommand(redis, ["SHUTDOWN"], false);
```

### Pipelining

```ts
import { pipelineCommands } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Resolves to [1, 2, 3, 4]
await pipelineCommands(redisConn, [
  ["INCR", "X"],
  ["INCR", "X"],
  ["INCR", "X"],
  ["INCR", "X"],
]);
```

## Principles

1. Designed to be fundamentally simple
2. Takes advantage of native Deno APIs and
   [Deno's standard library](https://deno.land/std) without custom classes
3. Promotes using Redis commands without intermediate abstractions

## Prerequisites

Redis must be installed on your local machine (guide
[here](https://redis.io/docs/getting-started/installation/)). Doing so enables
the use of the `redis-server` CLI tool, which is used to start a local Redis
server for testing and benchmarks.

## Testing

```bash
deno task test
```

## Benchmarks

```bash
deno task bench
```
