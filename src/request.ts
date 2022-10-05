import { writeAll } from "../deps.ts";
import { ARRAY_PREFIX, BULK_STRING_PREFIX, CRLF, encoder } from "./common.ts";

/** Redis command, which is an array of arguments. */
export type Command = (string | number)[];

/**
 * Transforms a command, which is an array of arguments, into an RESP request.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
export function createRequest(command: Command): Uint8Array {
  let request = ARRAY_PREFIX + command.length + CRLF;
  for (const arg of command) {
    request += BULK_STRING_PREFIX + arg.toString().length + CRLF;
    request += arg + CRLF;
  }
  return encoder.encode(request);
}

/**
 * Just writes a command to the Redis server.
 *
 * Example:
 * ```ts
 * import { writeCommand } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * await writeCommand(redisConn, ["SHUTDOWN"]);
 * ```
 */
export async function writeCommand(
  redisConn: Deno.Conn,
  command: Command,
): Promise<void> {
  await writeAll(redisConn, createRequest(command));
}
