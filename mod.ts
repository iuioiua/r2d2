import { BufReader, concat, writeAll } from "./deps.ts";

/** Redis command, which is an array of arguments. */
export type Command = (string | number | Uint8Array)[];
/** Parsed Redis reply */
export type Reply = string | number | null | Reply[];

const CRLF = "\r\n";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function removePrefix(line: string): string {
  return line.slice(1);
}

/**
 * Transforms a command, which is an array of arguments, into an RESP request string.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
function createRequest(command: Command): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(encoder.encode("*" + command.length + CRLF));
  for (const arg of command) {
    const bytes = arg instanceof Uint8Array
      ? arg
      : encoder.encode(arg.toString());
    parts.push(encoder.encode("$" + bytes.byteLength.toString() + CRLF));
    parts.push(bytes);
    parts.push(encoder.encode(CRLF));
  }
  return concat(...parts);
}

/**
 * Just writes a command to the Redis server.
 *
 * Example:
 * ```ts
 * await writeCommand(redisConn, ["SHUTDOWN"]);
 * ```
 */
export async function writeCommand(
  redisConn: Deno.Conn,
  command: Command,
): Promise<void> {
  await writeAll(redisConn, createRequest(command));
}

/**
 * Reads and processes the response line-by-line.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#resp-protocol-description}
 */
async function readReply(bufReader: BufReader): Promise<Reply> {
  const result = await bufReader.readLine();
  if (result === null) {
    return await Promise.reject("No response received from Redis server");
  }
  const line = decoder.decode(result.line);
  switch (line.charAt(0)) {
    /** Simple string */
    case "+":
      return removePrefix(line);
    /** Error */
    case "-":
      return await Promise.reject(removePrefix(line));
    /** Integer */
    case ":":
      return Number(removePrefix(line));
    /** Bulk string */
    case "$":
      return Number(removePrefix(line)) === -1
        ? null
        : /** Skip to reading the next line, which is a string */
          await readReply(bufReader);
    /** Array */
    case "*": {
      const length = Number(removePrefix(line));
      if (length === -1) {
        return null;
      }
      const array: Reply[] = [];
      for (let i = 0; i < length; i++) {
        array.push(await readReply(bufReader));
      }
      return array;
    }
    /** No prefix */
    default:
      return line;
  }
}

/**
 * Sends a command to the Redis server and returns the parsed reply.
 *
 * Example:
 * ```ts
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * // Returns "OK"
 * await sendCommand(redisConn, ["SET", "hello", "world"]);
 *
 * // Returns "world"
 * await sendCommand(redisConn, ["GET", "hello"]);
 * ```
 */
export async function sendCommand(
  redisConn: Deno.Conn,
  command: Command,
): Promise<Reply> {
  await writeCommand(redisConn, command);
  return await readReply(new BufReader(redisConn));
}

async function readRawReply(bufReader: BufReader): Promise<Uint8Array> {
  const result = await bufReader.readLine();
  if (result === null) {
    return await Promise.reject("No response received from Redis server");
  }
  if (!decoder.decode(result.line).startsWith("$")) {
    return await Promise.reject("Reply must be a bulk string");
  }
  return (await bufReader.readLine())!.line;
}

/**
 * Sends a command to the Redis server and returns the raw reply.
 *
 * Example:
 * ```ts
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * const value = new Uint8Array([0, 1, 2, 1, 2, 1, 2, 3]);
 *
 * // Returns "OK"
 * await sendCommand(redisConn, ["SET", "binary", value]);
 *
 * // Returns Uint8Array(8) [0, 1, 2, 1, 2, 1, 2, 3]
 * await sendCommandRawReply(redisConn, ["GET", "binary"]);
 * ```
 */
export async function sendCommandRawReply(
  redisConn: Deno.Conn,
  command: Command,
): Promise<Uint8Array> {
  await writeCommand(redisConn, command);
  return await readRawReply(new BufReader(redisConn));
}

/**
 * Pipelines commands to the Redis server and returns the parsed replies.
 *
 * Example:
 * ```ts
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * // Returns [1, 2, 3, 4]
 * await pipelineCommands(redisConn, [
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 * ]);
 * ```
 */
export async function pipelineCommands(
  redisConn: Deno.Conn,
  commands: Command[],
): Promise<Reply[]> {
  const request = concat(...commands.map(createRequest));
  await writeAll(redisConn, request);
  const bufReader = new BufReader(redisConn);
  const replies: Reply[] = [];
  for (let i = 0; i < commands.length; i++) {
    replies.push(await readReply(bufReader));
  }
  return replies;
}

/**
 * Used for pub/sub. Listens for replies from the Redis server.
 *
 * Example:
 * ```ts
 * await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
 *
 * for await (const reply of listenReplies(redisConn)) {
 *   // Prints ["subscribe", "mychannel", 1] first iteration
 *   console.log(reply);
 * }
 * ```
 */
export async function* listenReplies(
  redisConn: Deno.Conn,
): AsyncIterable<Reply> {
  const bufReader = new BufReader(redisConn);
  while (true) {
    yield await readReply(bufReader);
  }
}
