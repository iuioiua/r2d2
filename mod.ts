import { BufReader, TextProtoReader, writeAll } from "./deps.ts";

/** Redis command, which is an array of arguments. */
export type Command = (string | number)[];
/** Parsed Redis reply */
export type Reply = string | number | null | Reply[];

const CRLF = "\r\n";
const encoder = new TextEncoder();

function removePrefix(line: string): string {
  return line.slice(1);
}

/**
 * Transforms a command, which is an array of arguments, into an RESP request string.
 * @see https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server
 */
function stringifyRequest(command: Command): string {
  let request = "*" + command.length + CRLF;
  for (const arg of command) {
    request += "$" + arg.toString().length + CRLF;
    request += arg + CRLF;
  }
  return request;
}

/** Encodes and sends the request string to the server. */
async function writeRequest(
  conn: Deno.Conn,
  request: string,
): Promise<void> {
  await writeAll(conn, encoder.encode(request));
}

async function readNonNullArray(
  tpReader: TextProtoReader,
  length: number,
): Promise<Reply[]> {
  const array = [];
  for (let i = 0; i < length; i++) {
    const reply: Reply = await readReply(tpReader);
    array.push(reply);
  }
  return array;
}

/**
 * Reads and processes the response line-by-line.
 * @see https://redis.io/docs/reference/protocol-spec/#resp-protocol-description
 */
async function readReply(tpReader: TextProtoReader): Promise<Reply> {
  const line = await tpReader.readLine();
  switch (line!.charAt(0)) {
    /** Simple string */
    case "+":
      return removePrefix(line!);
    /** Error */
    case "-":
      return await Promise.reject(removePrefix(line!));
    /** Integer */
    case ":":
      return Number(removePrefix(line!));
    /** Bulk string */
    case "$":
      return Number(removePrefix(line!)) === -1
        ? null
        : /** Skip to reading the next line, which is a string */
          await readReply(tpReader);
    /** Array */
    case "*": {
      const length = Number(removePrefix(line!));
      return length === -1 ? null : await readNonNullArray(tpReader, length);
    }
    /** No prefix */
    default:
      return line;
  }
}

function toTpReader(redisConn: Deno.Conn): TextProtoReader {
  return new TextProtoReader(new BufReader(redisConn));
}

/**
 * Sends a command to the Redis server and returns the parsed reply.
 *
 * Example:
 * ```ts
 * import { sendCommand } from "https://deno.land/x/r2d2/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * // Resolves to "OK"
 * await sendCommand(redisConn, ["SET", "hello", "world"]);
 *
 * // Prints "world"
 * console.log(await sendCommand(redisConn, ["GET", "hello"]));
 * ```
 * @param redisConn Redis connection to the server.
 * @param command Redis command, which is an array of arguments.
 * @param echo If `true`, a reply is read. Defaults to true.
 * @returns Parsed Redis reply
 */
export async function sendCommand(
  redisConn: Deno.Conn,
  command: Command,
  echo = true,
): Promise<Reply | void> {
  await writeRequest(redisConn, stringifyRequest(command));
  if (echo) {
    return await readReply(toTpReader(redisConn));
  }
}

/**
 * Pipelines commands to the Redis server and returns the parsed replies.
 *
 * Example:
 * ```ts
 * import { pipelineCommands } from "https://deno.land/x/r2d2/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * // Resolves to [1, 2, 3, 4]
 * await pipelineCommands(redisConn, [
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 * ]);
 * ```
 *
 * @param redisConn Redis connection to the server
 * @param commands An array of Redis commands
 * @param echo If `true`, replies are read. Defaults to true.
 * @returns Parsed Redis replies
 */
export async function pipelineCommands(
  redisConn: Deno.Conn,
  commands: Command[],
  echo = true,
): Promise<Reply[] | void> {
  const request = commands.map(stringifyRequest).join("");
  await writeRequest(redisConn, request);
  if (echo) {
    const tpReader = toTpReader(redisConn);
    const replies: Reply[] = [];
    for (const _ of commands) {
      const reply = await readReply(tpReader);
      replies.push(reply);
    }
    return replies;
  }
}
