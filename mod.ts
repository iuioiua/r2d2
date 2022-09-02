import { BufReader, concat, writeAll } from "./deps.ts";

/** Redis command, which is an array of arguments. */
export type Command = (string | number)[];
/** Parsed Redis reply */
export type Reply = string | number | null | Reply[];

const CRLF = "\r\n";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SIMPLE_STRING_PREFIX = "+";
const ERROR_PREFIX = "-";
const INTEGER_PREFIX = ":";
const BULK_STRING_PREFIX = "$";
const ARRAY_PREFIX = "*";

function removePrefix(line: string): string {
  return line.slice(1);
}

/**
 * Transforms a command, which is an array of arguments, into an RESP request.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
function createRequest(command: Command): Uint8Array {
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
 * await writeCommand(redisConn, ["SHUTDOWN"]);
 * ```
 */
export async function writeCommand(
  redisConn: Deno.Conn,
  command: Command,
): Promise<void> {
  await writeAll(redisConn, createRequest(command));
}

function readSimpleString(line: string): string {
  return removePrefix(line);
}

async function readError(line: string): Promise<never> {
  return await Promise.reject(removePrefix(line));
}

function readInteger(line: string): number {
  return Number(removePrefix(line));
}

async function readBulkString(
  line: string,
  bufReader: BufReader,
): Promise<null | string> {
  return readInteger(line) === -1
    ? null
    : /** Skip to reading the next line, which is a string */
      await readReply(bufReader) as string;
}

async function readRepliesN(
  length: number,
  bufReader: BufReader,
): Promise<Reply[]> {
  const array: Reply[] = [];
  for (let i = 0; i < length; i++) {
    array.push(await readReply(bufReader));
  }
  return array;
}

async function readArray(
  line: string,
  bufReader: BufReader,
): Promise<null | Reply[]> {
  const length = readInteger(line);
  return length === -1 ? null : await readRepliesN(length, bufReader);
}

/**
 * Reads and processes the response line-by-line.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#resp-protocol-description}
 */
async function readReply(bufReader: BufReader): Promise<Reply> {
  const result = await bufReader.readLine();
  if (!result) {
    return await Promise.reject("No reply received from Redis server");
  }
  const line = decoder.decode(result.line);
  switch (line.charAt(0)) {
    case SIMPLE_STRING_PREFIX:
      return readSimpleString(line);
    case ERROR_PREFIX:
      return readError(line);
    case INTEGER_PREFIX:
      return readInteger(line);
    case BULK_STRING_PREFIX:
      return await readBulkString(line, bufReader);
    case ARRAY_PREFIX:
      return await readArray(line, bufReader);
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
  return readRepliesN(commands.length, new BufReader(redisConn));
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
): AsyncIterableIterator<Reply> {
  const bufReader = new BufReader(redisConn);
  while (true) {
    yield await readReply(bufReader);
  }
}
