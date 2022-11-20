// deno-lint-ignore-file no-explicit-any
import { writeAll } from "https://deno.land/std@0.164.0/streams/conversion.ts";
import { readDelim } from "https://deno.land/std@0.164.0/io/buffer.ts";
import { chunk } from "https://deno.land/std@0.164.0/collections/chunk.ts";

/** Redis command */
export type Command = (string | number)[];
/** Redis reply */
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
const decoder = new TextDecoder();

const ARRAY_PREFIX = "*".charCodeAt(0);
const ATTRIBUTE_PREFIX = "|".charCodeAt(0);
const BIG_NUMBER_PREFIX = "(".charCodeAt(0);
const BLOB_ERROR_PREFIX = "!".charCodeAt(0);
const BOOLEAN_PREFIX = "#".charCodeAt(0);
const BULK_STRING_PREFIX = "$".charCodeAt(0);
const DOUBLE_PREFIX = ",".charCodeAt(0);
const ERROR_PREFIX = "-".charCodeAt(0);
const INTEGER_PREFIX = ":".charCodeAt(0);
const MAP_PREFIX = "%".charCodeAt(0);
const NULL_PREFIX = "_".charCodeAt(0);
const PUSH_PREFIX = ">".charCodeAt(0);
const SET_PREFIX = "~".charCodeAt(0);
const SIMPLE_STRING_PREFIX = "+".charCodeAt(0);
const VERBATIM_STRING_PREFIX = "=".charCodeAt(0);

const STREAMED_REPLY_START_DELIMITER = "?".charCodeAt(0);
const STREAMED_STRING_END_DELIMITER = ";0";
const STREAMED_AGGREGATE_END_DELIMITER = ".";

/** 1. Request */

/**
 * Transforms a command, which is an array of arguments, into an RESP request.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
function createCommandString(command: Command): string {
  let string = String.fromCharCode(ARRAY_PREFIX) + command.length + CRLF;
  for (const arg of command) {
    string += String.fromCharCode(BULK_STRING_PREFIX) + arg.toString().length +
      CRLF +
      arg + CRLF;
  }
  return string;
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
  writer: Deno.Writer,
  command: Command,
): Promise<void> {
  await writeAll(writer, encoder.encode(createCommandString(command)));
}

/** 2. Reply */

function removePrefix(line: Uint8Array): string {
  return decoder.decode(line.slice(1));
}

function isSteamedReply(line: Uint8Array): boolean {
  return line[1] === STREAMED_REPLY_START_DELIMITER;
}

function toObject(array: any[]): Record<string, any> {
  return Object.fromEntries(chunk(array, 2));
}

async function readNReplies(
  length: number,
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  for (let i = 0; i < length; i++) {
    replies.push(await readReply(iterator));
  }
  return replies;
}

async function readStreamedReply(
  delimiter: string,
  iterator: AsyncIterableIterator<Uint8Array>,
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
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
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
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<null | Reply> {
  await readMap(line, iterator);
  return await readReply(iterator);
}

function readBigNumber(line: Uint8Array): BigInt {
  return BigInt(removePrefix(line));
}

async function readBlobError(
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<never> {
  /** Skip to reading the next line, which is a string */
  const { value } = await iterator.next();
  return await Promise.reject(decoder.decode(value));
}

function readBoolean(line: Uint8Array): boolean {
  return removePrefix(line) === "t";
}

/** Also reads verbatim string */
async function readBulkString(
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<string | null> {
  return readNumber(line) === -1
    ? null
    : decoder.decode((await iterator.next()).value!);
}

async function readError(line: Uint8Array): Promise<never> {
  return await Promise.reject(removePrefix(line));
}

async function readMap(
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Record<string, any>> {
  const length = readNumber(line) * 2;
  const array = await readNReplies(length, iterator);
  return toObject(array);
}

/** Reads an integer or double */
function readNumber(line: Uint8Array): number {
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
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Set<Reply>> {
  return new Set(await readArray(line, iterator));
}

function readSimpleString(line: Uint8Array): string {
  return removePrefix(line);
}

async function readStreamedArray(
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Reply[]> {
  return await readStreamedReply(STREAMED_AGGREGATE_END_DELIMITER, iterator);
}

async function readStreamedMap(
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Record<string, any>> {
  const array = await readStreamedReply(
    STREAMED_AGGREGATE_END_DELIMITER,
    iterator,
  );
  return toObject(array);
}

async function readStreamedSet(
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Set<Reply>> {
  return new Set(await readStreamedArray(iterator));
}

async function readStreamedString(
  iterator: AsyncIterableIterator<Uint8Array>,
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
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Reply> {
  const { value } = await iterator.next();
  switch (value[0]) {
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
      return decoder.decode(value);
  }
}

/** 3. Combined */

/**
 * Sends a command to the Redis server and returns the parsed reply.
 *
 * Example:
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
  return await readReply(readDelim(redisConn, encoder.encode(CRLF)));
}

/**
 * Pipelines commands to the Redis server and returns the parsed replies.
 *
 * Example:
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
  return readNReplies(
    commands.length,
    readDelim(redisConn, encoder.encode(CRLF)),
  );
}

/**
 * Used for pub/sub. Listens for replies from the Redis server.
 *
 * Example:
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
 *
 * @deprecated Use `readReplies` instead. This will be removed in v1.1.
 */
export const listenReplies = readReplies;

/**
 * Used for pub/sub. Listens for replies from the Redis server.
 *
 * Example:
 * ```ts
 * import { writeCommand, readReplies } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
 *
 * for await (const reply of readReplies(redisConn)) {
 *   // Prints ["subscribe", "mychannel", 1] first iteration
 *   console.log(reply);
 * }
 * ```
 */
export async function* readReplies(
  redisConn: Deno.Conn,
): AsyncIterableIterator<Reply> {
  const iterator = readDelim(redisConn, encoder.encode(CRLF));
  while (true) {
    yield await readReply(iterator);
  }
}
