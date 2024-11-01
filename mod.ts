// deno-lint-ignore-file no-explicit-any
import { chunk } from "@std/collections/chunk";
import { concat } from "@std/bytes/concat";
import { readDelim } from "@std/io/read_delim";
import { writeAll } from "@std/io/write_all";
import type { Writer } from "@std/io/types";

/**
 * A Redis client that can be used to send commands to a Redis server.
 *
 * ```ts ignore
 * import { RedisClient } from "jsr:@iuioiua/r2d2";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * // Returns "OK"
 * await redisClient.sendCommand(["SET", "hello", "world"]);
 *
 * // Returns "world"
 * await redisClient.sendCommand(["GET", "hello"]);
 * ```
 *
 * @module
 */

/** Command sent to a Redis server. */
export type Command = (string | number | Uint8Array)[];
/** Reply received from a Redis server and triggered by a command. */
export type Reply =
  | string
  | number
  | null
  | boolean
  | bigint
  | Record<string, any>
  | Reply[];

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CRLF = "\r\n";
const CRLF_RAW = encoder.encode(CRLF);

const ARRAY_PREFIX_STRING = "*";
const BULK_STRING_PREFIX_STRING = "$";

const ARRAY_PREFIX = ARRAY_PREFIX_STRING.charCodeAt(0);
const ATTRIBUTE_PREFIX = "|".charCodeAt(0);
const BIG_NUMBER_PREFIX = "(".charCodeAt(0);
const BLOB_ERROR_PREFIX = "!".charCodeAt(0);
const BOOLEAN_PREFIX = "#".charCodeAt(0);
const BULK_STRING_PREFIX = BULK_STRING_PREFIX_STRING.charCodeAt(0);
const DOUBLE_PREFIX = ",".charCodeAt(0);
const ERROR_PREFIX = "-".charCodeAt(0);
const INTEGER_PREFIX = ":".charCodeAt(0);
const MAP_PREFIX = "%".charCodeAt(0);
const NULL_PREFIX = "_".charCodeAt(0);
const PUSH_PREFIX = ">".charCodeAt(0);
const SET_PREFIX = "~".charCodeAt(0);
const SIMPLE_STRING_PREFIX = "+".charCodeAt(0);
const VERBATIM_STRING_PREFIX = "=".charCodeAt(0);

/**
 * Transforms a command, which is an array of arguments, into an RESP request.
 *
 * @see {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
function createRequest(command: Command): Uint8Array {
  const lines = [encoder.encode(ARRAY_PREFIX_STRING + command.length + CRLF)];
  for (const arg of command) {
    const bytes = arg instanceof Uint8Array
      ? arg
      : encoder.encode(arg.toString());
    lines.push(
      encoder.encode(BULK_STRING_PREFIX_STRING + bytes.byteLength + CRLF),
    );
    lines.push(bytes);
    lines.push(CRLF_RAW);
  }
  return concat(lines);
}

async function writeCommand(
  writer: Writer,
  command: Command,
): Promise<void> {
  await writeAll(writer, createRequest(command));
}

function removePrefix(line: Uint8Array): string {
  return decoder.decode(line.slice(1));
}

function toObject(array: any[]): Record<string, any> {
  return Object.fromEntries(chunk(array, 2));
}

async function readNReplies(
  length: number,
  iterator: AsyncIterableIterator<Uint8Array>,
  raw = false,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  for (let i = 0; i < length; i++) {
    replies.push(await readReply(iterator, raw));
  }
  return replies;
}

async function readArray(
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<null | Reply[]> {
  const length = readNumberOrDouble(line);
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
  raw = false,
): Promise<null | Reply> {
  await readMap(line, iterator);
  return await readReply(iterator, raw);
}

function readBigNumber(line: Uint8Array): bigint {
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

async function readBulkOrVerbatimString(
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
  raw = false,
): Promise<string | null> {
  if (readNumberOrDouble(line) === -1) {
    return null;
  }
  const { value } = await iterator.next();
  return raw ? value : decoder.decode(value);
}

async function readError(line: Uint8Array): Promise<never> {
  return await Promise.reject(removePrefix(line));
}

async function readMap(
  line: Uint8Array,
  iterator: AsyncIterableIterator<Uint8Array>,
): Promise<Record<string, any>> {
  const length = readNumberOrDouble(line) * 2;
  const array = await readNReplies(length, iterator);
  return toObject(array);
}

function readNumberOrDouble(line: Uint8Array): number {
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

/**
 * Reads and processes the response line-by-line. Exported for testing.
 *
 * @see {@link https://github.com/redis/redis-specifications/blob/master/protocol/RESP3.md}
 *
 * @private
 */
export async function readReply(
  iterator: AsyncIterableIterator<Uint8Array>,
  raw = false,
): Promise<Reply> {
  const { value } = await iterator.next();
  if (value.length === 0) {
    return await Promise.reject(new TypeError("No reply received"));
  }
  switch (value[0]) {
    case ARRAY_PREFIX:
    case PUSH_PREFIX:
      return await readArray(value, iterator);
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
      return await readBulkOrVerbatimString(value, iterator, raw);
    case DOUBLE_PREFIX:
    case INTEGER_PREFIX:
      return readNumberOrDouble(value);
    case ERROR_PREFIX:
      return readError(value);
    case MAP_PREFIX:
      return await readMap(value, iterator);
    case NULL_PREFIX:
      return null;
    case SET_PREFIX:
      return await readSet(value, iterator);
    case SIMPLE_STRING_PREFIX:
      return readSimpleString(value);
    /** No prefix */
    default:
      return decoder.decode(value);
  }
}

async function sendCommand(
  redisConn: Deno.Conn,
  command: Command,
  raw = false,
): Promise<Reply> {
  await writeCommand(redisConn, command);
  return await readReply(readDelim(redisConn, CRLF_RAW), raw);
}

async function pipelineCommands(
  redisConn: Deno.Conn,
  commands: Command[],
): Promise<Reply[]> {
  const bytes = commands.map(createRequest);
  await writeAll(redisConn, concat(bytes));
  return readNReplies(commands.length, readDelim(redisConn, CRLF_RAW));
}

async function* readReplies(
  redisConn: Deno.Conn,
  raw = false,
): AsyncIterableIterator<Reply> {
  const iterator = readDelim(redisConn, CRLF_RAW);
  while (true) {
    yield await readReply(iterator, raw);
  }
}

class AsyncQueue {
  #queue: Promise<any> = Promise.resolve();

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.#queue = this.#queue.then(task);
    return await this.#queue;
  }
}

/**
 * A Redis client that can be used to send commands to a Redis server.
 *
 * @example
 * ```ts ignore
 * import { RedisClient } from "jsr:@iuioiua/r2d2";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * // Returns "OK"
 * await redisClient.sendCommand(["SET", "hello", "world"]);
 *
 * // Returns "world"
 * await redisClient.sendCommand(["GET", "hello"]);
 * ```
 */
export class RedisClient {
  #conn: Deno.TcpConn | Deno.TlsConn;
  #queue: AsyncQueue;

  /** Constructs a new instance. */
  constructor(conn: Deno.TcpConn | Deno.TlsConn) {
    this.#conn = conn;
    this.#queue = new AsyncQueue();
  }

  /**
   * Sends a command to the Redis server and returns the parsed reply.
   *
   * @example
   * ```ts ignore
   * import { RedisClient } from "jsr:@iuioiua/r2d2";
   *
   * const redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * // Returns "OK"
   * await redisClient.sendCommand(["SET", "hello", "world"]);
   *
   * // Returns "world"
   * await redisClient.sendCommand(["GET", "hello"]);
   * ```
   */
  async sendCommand(command: Command, raw = false): Promise<Reply> {
    return await this.#queue.enqueue(
      async () => await sendCommand(this.#conn, command, raw),
    );
  }

  /**
   * Just writes a command to the Redis server without listening for a reply.
   *
   * @example
   * ```ts ignore
   * import { RedisClient } from "jsr:@iuioiua/r2d2";
   *
   * const redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * await redisClient.writeCommand(["SHUTDOWN"]);
   * ```
   */
  async writeCommand(command: Command) {
    await this.#queue.enqueue(
      async () => await writeCommand(this.#conn, command),
    );
  }

  /**
   * Used for pub/sub. Listens for replies from the Redis server.
   *
   * @example
   * ```ts ignore
   * import { RedisClient } from "jsr:@iuioiua/r2d2";
   *
   * const redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * await redisClient.writeCommand(["SUBSCRIBE", "mychannel"]);
   *
   * for await (const reply of redisClient.readReplies()) {
   *   // Prints ["subscribe", "mychannel", 1] first iteration
   *   console.log(reply);
   * }
   * ```
   */
  readReplies(raw = false): AsyncIterableIterator<Reply> {
    return readReplies(this.#conn, raw);
  }

  /**
   * Pipelines commands to the Redis server and returns the parsed replies.
   *
   * @example
   * ```ts ignore
   * import { RedisClient } from "jsr:@iuioiua/r2d2";
   *
   * const redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * // Returns [1, 2, 3, 4]
   * await redisClient.pipelineCommands([
   *  ["INCR", "X"],
   *  ["INCR", "X"],
   *  ["INCR", "X"],
   *  ["INCR", "X"],
   * ]);
   * ```
   */
  async pipelineCommands(commands: Command[]): Promise<Reply[]> {
    return await this.#queue.enqueue(
      async () => await pipelineCommands(this.#conn, commands),
    );
  }
}
