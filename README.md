# r2d2

[![Docs](https://doc.deno.land/badge.svg)](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/iuioiua/r2d2/branch/main/graph/badge.svg?token=8IDAVSL014)](https://codecov.io/gh/iuioiua/r2d2)

Fast, lightweight Redis client library for [Deno](https://deno.land/). Designed
to be fundamentally simple and encourage the use of actual Redis commands
without unnecessary intermediate abstractions.

## Usage

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
