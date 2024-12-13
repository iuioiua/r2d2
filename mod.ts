// deno-lint-ignore-file no-explicit-any
import { chunk } from "@std/collections/chunk";
import { concat } from "@std/bytes/concat";
import { writeAll } from "@std/io/write-all";
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

async function* readLines(reader: Reader): AsyncIterableIterator<Uint8Array> {
  const buffer = new Uint8Array(1024);
  let chunks = new Uint8Array();
  while (true) {
    const result = await reader.read(buffer);
    if (result === null) break;
    chunks = concat([chunks, buffer.subarray(0, result)]);
    let index;
    while ((index = chunks.indexOf(CRLF[0])) !== -1) {
      if (chunks[index + 1] === CRLF[1]) {
        yield chunks.subarray(0, index);
        chunks = chunks.subarray(index + 2);
      } else {
        break;
      }
    }
  }
  yield chunks;
}

function readNReplies(
  length: number,
  iterator: AsyncIterableIterator<Uint8Array>,
  raw = false,
): Promise<Reply[]> {
  return Array.fromAsync({ length }, () => readReply(iterator, raw));
}

async function readReply(
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
      if (line === "-1") {
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

export class RedisClient {
  #conn: Reader & Writer;
  #lines: AsyncIterableIterator<Uint8Array>;
  #queue: Promise<any> = Promise.resolve();

  /** Constructs a new instance. */
  constructor(conn: Reader & Writer) {
    this.#conn = conn;
    this.#lines = readLines(this.#conn);
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
    return this.#enqueue(async () => {
      await writeCommand(this.#conn, command);
      return readReply(this.#lines, raw);
    });
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
  async *readReplies(raw = false): AsyncIterableIterator<Reply> {
    while (true) {
      yield await readReply(this.#lines, raw);
    }
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
    return this.#enqueue(async () => {
      const bytes = concat(commands.map(createRequest));
      await writeAll(this.#conn, bytes);
      return readNReplies(commands.length, this.#lines);
    });
  }
}
