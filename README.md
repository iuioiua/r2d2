# r2d2

[![JSR](https://jsr.io/badges/@iuioiua/r2d2)](https://jsr.io/@iuioiua/r2d2)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/iuioiua/r2d2/branch/main/graph/badge.svg?token=8IDAVSL014)](https://codecov.io/gh/iuioiua/r2d2)

Minimal [Redis](https://redis.io/) client for [Deno](https://deno.land/).

```ts ignore
import { RedisClient } from "@iuioiua/r2d2";
import { assertEquals } from "@std/assert/equals";

using redisConn = await Deno.connect({ port: 6379 });
const redisClient = new RedisClient(redisConn);

const reply1 = await redisClient.sendCommand(["SET", "hello", "world"]);
assertEquals(reply1, "OK");

const reply2 = await redisClient.sendCommand(["GET", "hello"]);
assertEquals(reply2, "world");
```

## Features

- Supports RESPv2, RESP3, raw data, pipelining, pub/sub, transactions and Lua
  scripts.
- Compatible with timeouts and retries.
- One of the fastest Redis clients in Deno.
- Written to be easily understood and debugged.
- Encourages the use of actual Redis commands without intermediate abstractions.

## Usage

See [documentation](https://jsr.io/@iuioiua/r2d2/doc) for usage instructions.

## Contributing

Before submitting a pull request, please run `deno task ok:dev`. This task
checks formatting, runs the linter and runs tests.

> Note: Redis must be installed on your local machine. For installation
> instructions, see [here](https://redis.io/docs/getting-started/installation/).

## Size comparison

| Module      | Size (KB) | Dependencies |
| ----------- | --------- | ------------ |
| r2d2        | 25.04     | 4            |
| deno-redis  | 213.19    | 33           |
| npm:ioredis | 895.38    | 10           |
| npm:redis   | 968.17    | 9            |

Recorded on December 20, 2024.

> Note: Results were produced using `deno info <module>`
