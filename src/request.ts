import { writeAll } from "../deps.ts";
import {
  ARRAY_PREFIX,
  BULK_STRING_PREFIX,
  CRLF,
  encoder,
} from "./constants.ts";

/** Redis command, which is an array of arguments. */
export type Command = (string | number)[];

/**
 * Transforms a command, which is an array of arguments, into an RESP request.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
export function createCommandString(command: Command): string {
  let string = ARRAY_PREFIX + command.length + CRLF;
  for (const arg of command) {
    string += BULK_STRING_PREFIX + arg.toString().length + CRLF +
      arg + CRLF;
  }
  return string;
}

/**
 * Just writes a command to the Redis server.
 *
 * @example
 * ```ts
 * import { writeCommand } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * await writeCommand(redisConn, ["SHUTDOWN"]);
 * ```
 */
export async function writeCommand(
  writer: Deno.Writer,
  command: Command,
): Promise<void> {
  await writeAll(writer, encoder.encode(createCommandString(command)));
}
