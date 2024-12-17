// deno-lint-ignore-file no-explicit-any
import { chunk } from "@std/collections/chunk";
import { concat } from "@std/bytes/concat";
import { writeAll } from "@std/io/write_all";
import type { Reader, Writer } from "@std/io/types";

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

const CRLF_STRING = "\r\n";
const ARRAY_PREFIX_STRING = "*";
const BULK_STRING_PREFIX_STRING = "$";

const CRLF = encoder.encode(CRLF_STRING);
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
  const lines = [
    encoder.encode(ARRAY_PREFIX_STRING + command.length + CRLF_STRING),
  ];
  for (const arg of command) {
    const bytes = arg instanceof Uint8Array
      ? arg
      : encoder.encode(arg.toString());
    lines.push(
      encoder.encode(
        BULK_STRING_PREFIX_STRING + bytes.byteLength + CRLF_STRING,
      ),
      bytes,
      CRLF,
    );
  }
  return concat(lines);
}

async function writeCommand(
  writer: Writer,
  command: Command,
): Promise<void> {
  await writeAll(writer, createRequest(command));
}

const DELIM_LPS = new Uint8Array([0, 0]);

/**
 * Reads and processes the response line-by-line. Exported for testing.
 *
 * @private
 */
export async function* readLines(
  reader: Reader,
): AsyncIterableIterator<Uint8Array> {
  let chunks = new Uint8Array();

  // Modified KMP
  let inspectIndex = 0;
  let matchIndex = 0;
  while (true) {
    const inspectArr = new Uint8Array(1024);
    const result = await reader.read(inspectArr);
    if (result === null) {
      // Yield last chunk.
      yield chunks;
      break;
    }
    chunks = concat([chunks, inspectArr.slice(0, result)]);
    let localIndex = 0;
    while (inspectIndex < chunks.length) {
      if (inspectArr[localIndex] === CRLF[matchIndex]) {
        inspectIndex++;
        localIndex++;
        matchIndex++;
        if (matchIndex === DELIM_LPS.length) {
          // Full match
          const matchEnd = inspectIndex - DELIM_LPS.length;
          const readyBytes = chunks.slice(0, matchEnd);
          yield readyBytes;
          // Reset match, different from KMP.
          chunks = chunks.slice(inspectIndex);
          inspectIndex = 0;
          matchIndex = 0;
        }
      } else {
        if (matchIndex === 0) {
          inspectIndex++;
          localIndex++;
        }
      }
    }
  }
}

function readNReplies(
  length: number,
  iterator: AsyncIterableIterator<Uint8Array>,
  raw = false,
): Promise<Reply[]> {
  return Array.fromAsync({ length }, () => readReply(iterator, raw));
}

/**
 * Reads and processes the response reply-by-reply. Exported for testing.
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
    return Promise.reject(new TypeError("No reply received"));
  }
  const line = decoder.decode(value.slice(1));
  switch (value[0]) {
    case ARRAY_PREFIX:
    case PUSH_PREFIX: {
      const length = Number(line);
      return length === -1 ? null : await readNReplies(length, iterator);
    }
    case ATTRIBUTE_PREFIX: {
      /**
       * Read but don't return attribute data.
       *
       * @todo include attribute data somehow
       */
      const length = Number(line) * 2;
      await readNReplies(length, iterator);
      return readReply(iterator, raw);
    }
    case BIG_NUMBER_PREFIX:
      return BigInt(line);
    case BLOB_ERROR_PREFIX: {
      /** Skip to reading the next line, which is a string */
      const { value } = await iterator.next();
      return Promise.reject(decoder.decode(value));
    }
    case BOOLEAN_PREFIX:
      return line === "t";
    case BULK_STRING_PREFIX:
    case VERBATIM_STRING_PREFIX: {
      if (Number(line) === -1) {
        return null;
      }
      const { value } = await iterator.next();
      return raw ? value : decoder.decode(value);
    }
    case DOUBLE_PREFIX:
    case INTEGER_PREFIX: {
      switch (line) {
        case "inf":
          return Infinity;
        case "-inf":
          return -Infinity;
        default:
          return Number(line);
      }
    }
    case ERROR_PREFIX:
      return Promise.reject(line);
    case MAP_PREFIX: {
      const length = Number(line) * 2;
      const array = await readNReplies(length, iterator);
      return Object.fromEntries(chunk(array, 2));
    }
    case NULL_PREFIX:
      return null;
    case SET_PREFIX:
      return new Set(await readNReplies(Number(line), iterator, raw));
    case SIMPLE_STRING_PREFIX:
      return line;
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
  return readReply(readLines(redisConn), raw);
}

async function pipelineCommands(
  redisConn: Deno.Conn,
  commands: Command[],
): Promise<Reply[]> {
  const bytes = commands.map(createRequest);
  await writeAll(redisConn, concat(bytes));
  return readNReplies(commands.length, readLines(redisConn));
}

async function* readReplies(
  redisConn: Deno.Conn,
  raw = false,
): AsyncIterableIterator<Reply> {
  const iterator = readLines(redisConn);
  while (true) {
    yield await readReply(iterator, raw);
  }
}

export class RedisClient {
  #conn: Deno.TcpConn | Deno.TlsConn;
  #queue: Promise<any> = Promise.resolve();

  /** Constructs a new instance. */
  constructor(conn: Deno.TcpConn | Deno.TlsConn) {
    this.#conn = conn;
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.#queue = this.#queue.then(task);
    return this.#queue;
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
  sendCommand(command: Command, raw = false): Promise<Reply> {
    return this.#enqueue(() => sendCommand(this.#conn, command, raw));
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
  writeCommand(command: Command): Promise<void> {
    return this.#enqueue(() => writeCommand(this.#conn, command));
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
  pipelineCommands(commands: Command[]): Promise<Reply[]> {
    return this.#enqueue(() => pipelineCommands(this.#conn, commands));
  }
}
