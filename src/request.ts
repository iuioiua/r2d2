import { writeAll } from "../deps.ts";
import {
  ARRAY_PREFIX,
  BOOLEAN_PREFIX,
  BULK_STRING_PREFIX,
  CRLF,
  encoder,
  NULL_PREFIX,
} from "./constants.ts";

type Arg = string | number | boolean | null;
/** Redis command, which is an array of arguments. */
export type Command = Arg[];

function serializeBulkString(arg: string): string {
  return BULK_STRING_PREFIX + arg.length + CRLF + arg + CRLF;
}

function serializeInteger(arg: number): string {
  return BULK_STRING_PREFIX + arg.toString().length + CRLF + arg + CRLF;
}

/** @todo: add test */
function serializeBoolean(arg: boolean): string {
  return BOOLEAN_PREFIX + (arg ? "t" : "f") + CRLF;
}

function serializeArg(arg: Arg): string {
  switch (typeof arg) {
    case "string":
      return serializeBulkString(arg);
    case "number":
      return serializeInteger(arg);
    case "boolean":
      return serializeBoolean(arg);
    /** @todo: support Record<...> */
    case "object":
      /** @todo: add test for null request */
      return NULL_PREFIX;
  }
}

/**
 * Transforms a command, which is an array of arguments, into an RESP request.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
export function createRequest(command: Command): Uint8Array {
  const request = ARRAY_PREFIX + command.length + CRLF +
    command.map(serializeArg).join("");
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
