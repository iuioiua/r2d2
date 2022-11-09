// deno-lint-ignore-file no-explicit-any
import { writeAll } from "https://deno.land/std@0.162.0/streams/conversion.ts";
import { readLines } from "https://deno.land/std@0.162.0/io/buffer.ts";
import { chunk } from "https://deno.land/std@0.162.0/collections/chunk.ts";

/**
 * Sections:
 * 1. Request
 * 2. Reply
 * 3. Combined
 */

export type Command = (string | number)[];
export type Reply =
  | string
  | number
  | null
  | boolean
  | BigInt
  | Record<string, any>
  | Reply[];

const CRLF = "\r\n";
const encoder = new TextEncoder();

export const ARRAY_PREFIX = "*";
export const ATTRIBUTE_PREFIX = "|";
export const BIG_NUMBER_PREFIX = "(";
export const BLOB_ERROR_PREFIX = "!";
export const BOOLEAN_PREFIX = "#";
export const BULK_STRING_PREFIX = "$";
export const DOUBLE_PREFIX = ",";
export const ERROR_PREFIX = "-";
export const INTEGER_PREFIX = ":";
export const MAP_PREFIX = "%";
export const NULL_PREFIX = "_";
export const PUSH_PREFIX = ">";
export const SET_PREFIX = "~";
export const SIMPLE_STRING_PREFIX = "+";
export const VERBATIM_STRING_PREFIX = "=";

export const STREAMED_REPLY_START_DELIMITER = "?";
export const STREAMED_STRING_END_DELIMITER = ";0";
export const STREAMED_AGGREGATE_END_DELIMITER = ".";

/** 1. Request */

/**
 * Transforms a command, which is an array of arguments, into an RESP request.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
function createCommandString(command: Command): string {
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

/** 2. Reply */

function removePrefix(line: string): string {
  return line.slice(1);
}

function isSteamedReply(line: string): boolean {
  return line.charAt(1) === STREAMED_REPLY_START_DELIMITER;
}

function toObject(array: any[]): Record<string, any> {
  return Object.fromEntries(chunk(array, 2));
}

async function readNReplies(
  length: number,
  iterator: AsyncIterableIterator<string>,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  for (let i = 0; i < length; i++) {
    replies.push(await readReply(iterator));
  }
  return replies;
}

async function readStreamedReply(
  delimiter: string,
  iterator: AsyncIterableIterator<string>,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  while (true) {
    const reply = await readReply(iterator);
    if (reply === delimiter) {
      break;
    }
    replies.push(reply);
  }
  return replies;
}

async function readArray(
  line: string,
  iterator: AsyncIterableIterator<string>,
): Promise<null | Reply[]> {
  const length = readNumber(line);
  return length === -1 ? null : await readNReplies(length, iterator);
}

/**
 * Read but don't return attribute data.
 *
 * @todo include attribute data somehow
 */
async function readAttribute(
  line: string,
  iterator: AsyncIterableIterator<string>,
): Promise<null | Reply> {
  await readMap(line, iterator);
  return await readReply(iterator);
}

function readBigNumber(line: string): BigInt {
  return BigInt(removePrefix(line));
}

async function readBlobError(
  iterator: AsyncIterableIterator<string>,
): Promise<never> {
  /** Skip to reading the next line, which is a string */
  return await Promise.reject(await readReply(iterator) as string);
}

function readBoolean(line: string): boolean {
  return removePrefix(line) === "t";
}

/** Also reads verbatim string */
async function readBulkString(
  line: string,
  iterator: AsyncIterableIterator<string>,
): Promise<string | null> {
  return readNumber(line) === -1 ? null : await readReply(iterator) as string;
}

async function readError(line: string): Promise<never> {
  return await Promise.reject(removePrefix(line));
}

async function readMap(
  line: string,
  iterator: AsyncIterableIterator<string>,
): Promise<Record<string, any>> {
  const length = readNumber(line) * 2;
  const array = await readNReplies(length, iterator);
  return toObject(array);
}

/** Reads an integer or double */
function readNumber(line: string): number {
  const number = removePrefix(line);
  switch (number) {
    case "inf":
      return Infinity;
    case "-inf":
      return -Infinity;
    default:
      return Number(number);
  }
}

async function readSet(
  line: string,
  iterator: AsyncIterableIterator<string>,
): Promise<Set<Reply>> {
  return new Set(await readArray(line, iterator));
}

function readSimpleString(line: string): string {
  return removePrefix(line);
}

async function readStreamedArray(
  iterator: AsyncIterableIterator<string>,
): Promise<Reply[]> {
  return await readStreamedReply(STREAMED_AGGREGATE_END_DELIMITER, iterator);
}

async function readStreamedMap(
  iterator: AsyncIterableIterator<string>,
): Promise<Record<string, any>> {
  const array = await readStreamedReply(
    STREAMED_AGGREGATE_END_DELIMITER,
    iterator,
  );
  return toObject(array);
}

async function readStreamedSet(
  iterator: AsyncIterableIterator<string>,
): Promise<Set<Reply>> {
  return new Set(await readStreamedArray(iterator));
}

async function readStreamedString(
  iterator: AsyncIterableIterator<string>,
): Promise<string> {
  return (await readStreamedReply(STREAMED_STRING_END_DELIMITER, iterator))
    /** Remove byte counts */
    .filter((line) => !(line as string).startsWith(";"))
    .join("");
}

/**
 * Reads and processes the response line-by-line.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#resp-protocol-description}
 */
export async function readReply(
  iterator: AsyncIterableIterator<string>,
): Promise<Reply> {
  const { value } = await iterator.next();
  switch (value.charAt(0)) {
    case ARRAY_PREFIX:
    case PUSH_PREFIX:
      return isSteamedReply(value)
        ? await readStreamedArray(iterator)
        : await readArray(value, iterator);
    case ATTRIBUTE_PREFIX:
      return await readAttribute(value, iterator);
    case BIG_NUMBER_PREFIX:
      return readBigNumber(value);
    case BLOB_ERROR_PREFIX:
      return readBlobError(iterator);
    case BOOLEAN_PREFIX:
      return readBoolean(value);
    case BULK_STRING_PREFIX:
    case VERBATIM_STRING_PREFIX:
      return isSteamedReply(value)
        ? await readStreamedString(iterator)
        : await readBulkString(value, iterator);
    case DOUBLE_PREFIX:
    case INTEGER_PREFIX:
      return readNumber(value);
    case ERROR_PREFIX:
      return readError(value);
    case MAP_PREFIX:
      return isSteamedReply(value)
        ? await readStreamedMap(iterator)
        : await readMap(value, iterator);
    case NULL_PREFIX:
      return null;
    case SET_PREFIX:
      return isSteamedReply(value)
        ? await readStreamedSet(iterator)
        : await readSet(value, iterator);
    case SIMPLE_STRING_PREFIX:
      return readSimpleString(value);
    /** No prefix */
    default:
      return value;
  }
}

/** 3. Combined */

/**
 * Sends a command to the Redis server and returns the parsed reply.
 *
 * @example
 * ```ts
 * import { sendCommand } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
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
  return await readReply(readLines(redisConn));
}

/**
 * Pipelines commands to the Redis server and returns the parsed replies.
 *
 * @example
 * ```ts
 * import { pipelineCommands } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
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
  const string = commands.map(createCommandString).join("");
  await writeAll(redisConn, encoder.encode(string));
  return readNReplies(commands.length, readLines(redisConn));
}

/**
 * Used for pub/sub. Listens for replies from the Redis server.
 *
 * @example
 * ```ts
 * import { writeCommand, listenReplies } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
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
  const iterator = readLines(redisConn);
  while (true) {
    yield await readReply(iterator);
  }
}
