// deno-lint-ignore-file no-explicit-any
import { writeAll } from "https://deno.land/std@0.160.0/streams/conversion.ts";
import { BufReader } from "https://deno.land/std@0.160.0/io/buffer.ts";
import { chunk } from "https://deno.land/std@0.160.0/collections/chunk.ts";

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
const decoder = new TextDecoder();

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
  bufReader: BufReader,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  for (let i = 0; i < length; i++) {
    replies.push(await readReply(bufReader));
  }
  return replies;
}

async function readStreamedReply(
  delimiter: string,
  bufReader: BufReader,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  while (true) {
    const reply = await readReply(bufReader);
    if (reply === delimiter) {
      break;
    }
    replies.push(reply);
  }
  return replies;
}

async function readArray(
  line: string,
  bufReader: BufReader,
): Promise<null | Reply[]> {
  const length = readNumber(line);
  return length === -1 ? null : await readNReplies(length, bufReader);
}

/**
 * Read but don't return attribute data.
 *
 * @todo include attribute data somehow
 */
async function readAttribute(
  line: string,
  bufReader: BufReader,
): Promise<null | Reply> {
  await readMap(line, bufReader);
  return await readReply(bufReader);
}

function readBigNumber(line: string): BigInt {
  return BigInt(removePrefix(line));
}

async function readBlobError(bufReader: BufReader): Promise<never> {
  /** Skip to reading the next line, which is a string */
  return await Promise.reject(await readReply(bufReader) as string);
}

function readBoolean(line: string): boolean {
  return removePrefix(line) === "t";
}

/** Also reads verbatim string */
async function readBulkString(
  line: string,
  bufReader: BufReader,
): Promise<null | string> {
  return removePrefix(line) === "-1"
    ? null
    : await readReply(bufReader) as string;
}

async function readError(line: string): Promise<never> {
  return await Promise.reject(removePrefix(line));
}

async function readMap(
  line: string,
  bufReader: BufReader,
): Promise<Record<string, any>> {
  const length = readNumber(line) * 2;
  const array = await readNReplies(length, bufReader);
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
  bufReader: BufReader,
): Promise<Set<Reply>> {
  return new Set(await readArray(line, bufReader));
}

function readSimpleString(line: string): string {
  return removePrefix(line);
}

async function readStreamedArray(bufReader: BufReader): Promise<Reply[]> {
  return await readStreamedReply(STREAMED_AGGREGATE_END_DELIMITER, bufReader);
}

async function readStreamedMap(
  bufReader: BufReader,
): Promise<Record<string, any>> {
  const array = await readStreamedReply(
    STREAMED_AGGREGATE_END_DELIMITER,
    bufReader,
  );
  return toObject(array);
}

async function readStreamedSet(bufReader: BufReader): Promise<Set<Reply>> {
  return new Set(await readStreamedArray(bufReader));
}

async function readStreamedString(bufReader: BufReader): Promise<string> {
  return (await readStreamedReply(STREAMED_STRING_END_DELIMITER, bufReader))
    /** Remove byte counts */
    .filter((line) => !(line as string).startsWith(";"))
    .join("");
}

/**
 * Reads and processes the response line-by-line.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#resp-protocol-description}
 */
export async function readReply(bufReader: BufReader): Promise<Reply> {
  const result = await bufReader.readLine();
  if (!result) {
    return await Promise.reject("No reply received from Redis server");
  }
  const line = decoder.decode(result.line);
  switch (line.charAt(0)) {
    case ARRAY_PREFIX:
    case PUSH_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedArray(bufReader)
        : await readArray(line, bufReader);
    case ATTRIBUTE_PREFIX:
      return await readAttribute(line, bufReader);
    case BIG_NUMBER_PREFIX:
      return readBigNumber(line);
    case BLOB_ERROR_PREFIX:
      return readBlobError(bufReader);
    case BOOLEAN_PREFIX:
      return readBoolean(line);
    case BULK_STRING_PREFIX:
    case VERBATIM_STRING_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedString(bufReader)
        : await readBulkString(line, bufReader);
    case DOUBLE_PREFIX:
    case INTEGER_PREFIX:
      return readNumber(line);
    case ERROR_PREFIX:
      return readError(line);
    case MAP_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedMap(bufReader)
        : await readMap(line, bufReader);
    case NULL_PREFIX:
      return null;
    case SET_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedSet(bufReader)
        : await readSet(line, bufReader);
    case SIMPLE_STRING_PREFIX:
      return readSimpleString(line);
    /** No prefix */
    default:
      return line;
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
  return await readReply(new BufReader(redisConn));
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
  return readNReplies(commands.length, new BufReader(redisConn));
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
  const bufReader = new BufReader(redisConn);
  while (true) {
    yield await readReply(bufReader);
  }
}
