# r2d2

Simple, lightweight Redis library for Deno.

```ts
import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";

const redisConn = await Deno.connect({ port: 6379 });

/** Resolves to "OK" */
await sendCommand(redisConn, ["SET", "hello", "world"]);

/** Prints "world" */
console.log(await sendCommand(redisConn, ["GET", "hello"]));
```
