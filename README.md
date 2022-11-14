# r2d2

[![Docs](https://doc.deno.land/badge.svg)](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/iuioiua/r2d2/branch/main/graph/badge.svg?token=8IDAVSL014)](https://codecov.io/gh/iuioiua/r2d2)

Fast, lightweight and simple Redis client library for
[Deno](https://deno.land/).

## Features

- Supports [RESPv2](#respv2), [RESP3](#resp3), [pipelining](#pipelining),
  [pub/sub](#pubsub), [transactions](#transactions),
  [eval scripts](#eval-script) and [Lua scripts](#lua-script).
- The fastest Redis client in Deno. [See below](#benchmarks) and
  [try benchmarking yourself](#contributing)!
- Written to be easily understood and debugged.
- Encourages the use of actual Redis commands without intermediate abstractions.

## Usage

Must be run with `--allow-net` permission. Check out the full documentation
[here](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts).

### RESPv2

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns "OK"
await sendCommand(redisConn, ["SET", "hello", "world"]);

// Returns "world"
await sendCommand(redisConn, ["GET", "hello"]);
```

If you don't care about the reply:

```ts
import { writeCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns nothing
await writeCommand(redisConn, ["SHUTDOWN"]);
```

### RESP3

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Switch to RESP3 protocol
await sendCommand(redisConn, ["HELLO", 3]);

// Returns 2
await sendCommand(redisConn, ["HSET", "hash3", "foo", 1, "bar", 2]);

// Returns { foo: "1", bar: "2" }
await sendCommand(redisConn, ["HGETALL", "hash3"]);
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
import { readReplies, writeCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
for await (const reply of readReplies(redisConn)) {
  // Prints ["subscribe", "mychannel", 1] first iteration
  console.log(reply);
}
```

### Transactions

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns "OK"
await sendCommand(redisConn, ["MULTI"]);

// Returns "QUEUED"
await sendCommand(redisConn, ["INCR", "FOO"]);

// Returns "QUEUED"
await sendCommand(redisConn, ["INCR", "FOO"]);

// Returns [1, 1]
await sendCommand(redisConn, ["EXEC"]);
```

### Eval Script

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns "hello"
await sendCommand(redisConn, ["EVAL", "return ARGV[1]", 0, "hello"]);
```

### Lua Script

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Returns "mylib"
await sendCommand(redisConn, [
  "FUNCTION",
  "LOAD",
  "#!lua name=mylib\nredis.register_function('knockknock', function() return 'Who\\'s there?' end)",
]);

// Returns "Who's there?"
await sendCommand(redisConn, ["FCALL", "knockknock", 0]);
```

### Timeout

```ts
import { deadline } from "https://deno.land/std/async/mod.ts";
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

// Rejects if the command takes longer than 100 ms
await deadline(sendCommand(redisConn, ["SLOWLOG", "GET"]), 100);
```

## Contributing

Before submitting a pull request, please run:

1. `deno fmt`
2. `deno lint`
3. `deno task redis:start && deno task test` and ensure all tests pass
4. `deno task redis:start && deno task bench` and ensure performance hasn't
   degraded

> Note: Redis must be installed on your local machine. For installation
> instructions, see [here](https://redis.io/docs/getting-started/installation/).

## Comparison

Data recorded on November 15, 2022.

### Benchmarks

```
cpu: Apple M2
runtime: deno 1.28.0 (aarch64-apple-darwin)

benchmark        time (avg)             (min … max)       p75       p99      p995
--------------------------------------------------- -----------------------------
r2d2         171.63 µs/iter (126.62 µs … 751.12 µs) 175.25 µs  320.5 µs 369.08 µs
deno-redis   264.86 µs/iter   (152.71 µs … 5.23 ms) 255.79 µs 677.38 µs  844.5 µs
npm:ioredis  320.64 µs/iter   (194.67 µs … 4.35 ms) 248.79 µs    3.3 ms   3.47 ms
npm:redis    461.46 µs/iter   (196.88 µs … 6.18 ms) 347.75 µs    3.6 ms   3.94 ms

summary
  r2d2
   1.54x faster than deno-redis
   1.87x faster than npm:ioredis
   2.69x faster than npm:redis
```

> Node: Results were produced using `deno task redis:start && deno task bench`.

### Size

| Module      | Size (KB) | Unique dependencies |
| ----------- | --------- | ------------------- |
| r2d2        | 75.85     | 8                   |
| deno-redis  | 183.73    | 24                  |
| npm:ioredis | 890.96    | 10                  |
| npm:redis   | 890.18    | 9                   |

> Note: Results were produced using `deno info <module>`
