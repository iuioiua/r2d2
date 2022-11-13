# r2d2

[![Docs](https://doc.deno.land/badge.svg)](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/iuioiua/r2d2/branch/main/graph/badge.svg?token=8IDAVSL014)](https://codecov.io/gh/iuioiua/r2d2)

Fast, lightweight and simple Redis client library for
[Deno](https://deno.land/).

## Features

- Supports [RESPv2](#respv2), [RESP3](#resp3), [pipelining](#pipelining),
  [pub/sub](#pubsub) and [transactions](#transactions).
- The fastest Redis client in Deno. See below and try benchmarking yourself!
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
