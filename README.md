# r2d2

[![JSR](https://jsr.io/badges/@iuioiua/r2d2)](https://jsr.io/@iuioiua/r2d2)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/iuioiua/r2d2/branch/main/graph/badge.svg?token=8IDAVSL014)](https://codecov.io/gh/iuioiua/r2d2)

Minimal [Redis](https://redis.io/) client for [Deno](https://deno.land/).

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

## Comparison

Data recorded on December 20, 2024.

### Size

| Module      | Size (KB) | Dependencies |
| ----------- | --------- | ------------ |
| r2d2        | 24.99     | 4            |
| deno-redis  | 171.12    | 30           |
| npm:ioredis | 894.69    | 10           |
| npm:redis   | 951.12    | 9            |

> Note: Results were produced using `deno info <module>`
