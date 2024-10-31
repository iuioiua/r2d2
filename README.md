# r2d2

[![JSR](https://jsr.io/badges/@iuioiua/r2d2)](https://jsr.io/@iuioiua/r2d2)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/iuioiua/r2d2/branch/main/graph/badge.svg?token=8IDAVSL014)](https://codecov.io/gh/iuioiua/r2d2)

Minimal [Redis](https://redis.io/) client for [Deno](https://deno.land/).

## Features

- Supports [RESPv2](#respv2), [RESP3](#resp3), [raw data](#raw-data),
  [pipelining](#pipelining), [pub/sub](#pubsub), [transactions](#transactions),
  [eval scripts](#eval-script) and [Lua scripts](#lua-script).
- Compatible with [timeouts](#timeouts) and [retries](#retries).
- The fastest Redis client in Deno. [See below](#benchmarks) and
  [try benchmarking yourself](#contributing)!
- Written to be easily understood and debugged.
- Encourages the use of actual Redis commands without intermediate abstractions.

## Usage

Must be run with `--allow-net` permission. Check out the full documentation
[here](https://jsr.io/@iuioiua/r2d2).

### RESPv2

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Returns "OK"
await redisClient.sendCommand(["SET", "hello", "world"]);

// Returns "world"
await redisClient.sendCommand(["GET", "hello"]);
```

If you don't care about the reply:

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Returns nothing
await redisClient.writeCommand(["SHUTDOWN"]);
```

### RESP3

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Switch to RESP3 protocol
await redisClient.sendCommand(["HELLO", 3]);

// Returns 2
await redisClient.sendCommand(["HSET", "hash3", "foo", 1, "bar", 2]);

// Returns { foo: "1", bar: "2" }
await redisClient.sendCommand(["HGETALL", "hash3"]);
```

### Raw data

Set the last argument, `raw`, to `true` and bulk string replies will return raw
data instead of strings.

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

// Returns "OK"
await redisClient.sendCommand(["SET", "binary", data]);

// Returns same value as `data` variable
await redisClient.sendCommand(["GET", "binary"], true);
```

### Pipelining

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Returns [1, 2, 3, 4]
await redisClient.pipelineCommands([
  ["INCR", "X"],
  ["INCR", "X"],
  ["INCR", "X"],
  ["INCR", "X"],
]);
```

### Pub/Sub

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

await redisClient.writeCommand(["SUBSCRIBE", "mychannel"]);
for await (const reply of redisClient.readReplies()) {
  // Prints ["subscribe", "mychannel", 1] first iteration
  console.log(reply);
}
```

### Transactions

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Returns "OK"
await redisClient.sendCommand(["MULTI"]);

// Returns "QUEUED"
await redisClient.sendCommand(["INCR", "FOO"]);

// Returns "QUEUED"
await redisClient.sendCommand(["INCR", "FOO"]);

// Returns [1, 1]
await redisClient.sendCommand(["EXEC"]);
```

### Eval Scripts

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Returns "hello"
await redisClient.sendCommand(["EVAL", "return ARGV[1]", 0, "hello"]);
```

### Lua Scripts

```ts ignore
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Returns "mylib"
await redisClient.sendCommand([
  "FUNCTION",
  "LOAD",
  "#!lua name=mylib\nredis.register_function('knockknock', function() return 'Who\\'s there?' end)",
]);

// Returns "Who's there?"
await redisClient.sendCommand(["FCALL", "knockknock", 0]);
```

### Timeouts

For further details on `deadline()`, see the documentation
[here](https://jsr.io/@std/async/doc/~/deadline).

```ts ignore
import { deadline } from "jsr:@std/async";
import { RedisClient } from "jsr:@iuioiua/r2d2";

const redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

// Rejects if the command takes longer than 100 ms
await deadline(redisClient.sendCommand(["SLOWLOG", "GET"]), 100);
```

> Note: this was added in v0.101.0 of the Deno Standard Library.

### Retries

For further details on `retry()`, see the documentation
[here](https://jsr.io/@std/async/doc/~/retry).

```ts ignore
import { retry } from "jsr:@std/async";
import { RedisClient } from "jsr:@iuioiua/r2d2";

// Retries to connect until successful using the exponential backoff algorithm.
const redisConn = await retry(async () => await Deno.connect({ port: 6379 }));
const redisClient = new RedisClient(redisConn);
```

> Note: this was added in v0.167.0 of the Deno Standard Library.

## Contributing

Before submitting a pull request, please run `deno task ok:dev`. This task
checks formatting, runs the linter and runs tests.

> Note: Redis must be installed on your local machine. For installation
> instructions, see [here](https://redis.io/docs/getting-started/installation/).

## Comparison

Data recorded on October 9, 2023.

### Benchmarks

[![Benchmark graph generated by Bxnch](https://bxnch.deno.dev/iuioiua/r2d2/main/bench.json?color=red)](https://github.com/iuioiua/bxnch)

> Note: Results were produced using `deno task bench:dev`.

### Size

| Module      | Size (KB) | Dependencies |
| ----------- | --------- | ------------ |
| r2d2        | 27.8      | 6            |
| deno-redis  | 166.49    | 25           |
| npm:ioredis | 894.69    | 10           |
| npm:redis   | 937.16    | 9            |

> Note: Results were produced using `deno info <module>`
