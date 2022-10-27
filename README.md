# r2d2

[![Docs](https://doc.deno.land/badge.svg)](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts)
[![CI](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml/badge.svg)](https://github.com/iuioiua/r2d2/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/iuioiua/r2d2/branch/main/graph/badge.svg?token=8IDAVSL014)](https://codecov.io/gh/iuioiua/r2d2)

Fast, lightweight and simple Redis client library for
[Deno](https://deno.land/).

## Features

- The fastest Redis client in Deno by up to 80%.
- Supports RESPv2, RESP3, pipelining and pub/sub.
- Written to be easily understood and debugged.
- Encourages the use of actual Redis commands without intermediate abstractions.

## Usage

Check out the documentation
[here](https://doc.deno.land/https://deno.land/x/r2d2/mod.ts).

## Contributing

Before submitting a pull request, please run:

1. `deno fmt`
2. `deno lint`
3. `deno task redis:start && deno task test` and ensure all tests pass
4. `deno task redis:start && deno task bench` and ensure performance hasn't
   degraded

> Note: Redis must be installed on your local machine. For installation
> instructions, see [here](https://redis.io/docs/getting-started/installation/).
