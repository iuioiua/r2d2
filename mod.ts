// deno-lint-ignore-file no-explicit-any
import { chunk } from "@std/collections/chunk";
import { concat } from "@std/bytes/concat";
import { writeAll } from "@std/io/write-all";
import type { Reader, Writer } from "@std/io/types";

/**
 * A Redis client for interacting with a Redis server.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * const reply1 = await redisClient.sendCommand(["SET", "hello", "world"]);
 * assertEquals(reply1, "OK");
 *
 * const reply2 = await redisClient.sendCommand(["GET", "hello"]);
 * assertEquals(reply2, "world");
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

/**
 * A Redis client for interacting with a Redis server.
 *
 * @example Send RESPv2 commands
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * const reply1 = await redisClient.sendCommand(["SET", "hello", "world"]);
 * assertEquals(reply1, "OK");
 *
 * const reply2 = await redisClient.sendCommand(["GET", "hello"]);
 * assertEquals(reply2, "world");
 * ```
 *
 * @example Send RESP3 commands
 *
 * Switch to
 * {@link https://github.com/redis/redis-specifications/blob/master/protocol/RESP3.md | RESP3}
 * by sending a {@link https://redis.io/docs/latest/commands/hello/ | HELLO}
 * command with the version number 3.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * // Switch to RESP3
 * await redisClient.sendCommand(["HELLO", 3]);
 *
 * const reply1 = await redisClient.sendCommand(["HSET", "myhash", "foo", 1, "bar", 2]);
 * assertEquals(reply1, 2);
 *
 * const reply2 = await redisClient.sendCommand(["HGETALL", "myhash"]);
 * assertEquals(reply2, { foo: "1", bar: "2" });
 * ```
 *
 * @example Receive raw data
 *
 * Receive raw data by setting the `raw` parameter to `true` for your given
 * method. This functionality is exclusive to bulk string replies.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
 *
 * const reply1 = await redisClient.sendCommand(["SET", "data", data]);
 * assertEquals(reply1, "OK");
 *
 * const reply2 = await redisClient.sendCommand(["GET", "data"], true);
 * assertEquals(reply2, data);
 * ```
 *
 * @example Execute operations with timeouts
 *
 * See the Deno Standard Library's
 * {@linkcode https://jsr.io/@std/async/doc/~/deadline | deadline()} for more
 * information. This function can be applied to any asynchronous operation.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { deadline } from "@std/async/deadline";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * // Rejects with a timeout error if the command takes longer than 100 milliseconds.
 * await deadline(redisClient.sendCommand(["GET", "foo"]), 100);
 * ```
 *
 * @example Retry operations
 *
 * See the Deno Standard Library's
 * {@linkcode https://jsr.io/@std/async/doc/~/retry | retry()} for more
 * information. This function can be applied to any asynchronous operation.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { retry } from "@std/async/retry";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * // Retries to connect until successful using the exponential backoff algorithm.
 * await retry(() => redisClient.sendCommand(["GET", "foo"]));
 * ```
 *
 * @example Pipeline commands
 *
 * See
 * {@link https://redis.io/docs/latest/develop/use/pipelining/ | Redis pipelining}
 * for more information.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * const replies = await redisClient.pipelineCommands([
 *   ["INCR", "Y"],
 *   ["INCR", "Y"],
 *   ["INCR", "Y"],
 *   ["INCR", "Y"],
 * ]);
 * assertEquals(replies, [1, 2, 3, 4]);
 * ```
 *
 * @example Use pub/sub channels
 *
 * See
 * {@link https://redis.io/docs/latest/develop/interact/pubsub/ | Redis Pub/Sub}
 * for more information.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * await redisClient.writeCommand(["SUBSCRIBE", "mychannel"]);
 * for await (const reply of redisClient.readReplies()) {
 *   assertEquals(reply, ["subscribe", "mychannel", 1]);
 *   break;
 * }
 * await redisClient.writeCommand(["UNSUBSCRIBE", "mychannel"]);
 * ```
 *
 * @example Perform transaction
 *
 * See {@link https://redis.io/docs/latest/develop/interact/transactions/ | Transactions}
 * for more information.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * assertEquals(await redisClient.sendCommand(["MULTI"]), "OK");
 * assertEquals(await redisClient.sendCommand(["INCR", "QUX"]), "QUEUED");
 * assertEquals(await redisClient.sendCommand(["INCR", "QUX"]), "QUEUED");
 * assertEquals(await redisClient.sendCommand(["EXEC"]), [1, 2]);
 * ```
 *
 * @example Execute Lua scripts
 *
 * See
 * {@link https://redis.io/docs/latest/develop/interact/programmability/eval-intro/ | Scripting with Lua}
 * for more information.
 *
 * ```ts ignore
 * import { RedisClient } from "@iuioiua/r2d2";
 * import { assertEquals } from "@std/assert/equals";
 *
 * using redisConn = await Deno.connect({ port: 6379 });
 * const redisClient = new RedisClient(redisConn);
 *
 * const reply1 = await redisClient.sendCommand(["EVAL", "return ARGV[1]", 0, "hello"]);
 * assertEquals(reply1, "hello");
 *
 * const reply2 = await redisClient.sendCommand([
 *   "FUNCTION",
 *   "LOAD",
 *   "#!lua name=mylib\nredis.register_function('knockknock', function() return 'Who\\'s there?' end)",
 * ]);
 * assertEquals(reply2, "mylib");
 *
 * const reply3 = await redisClient.sendCommand(["FCALL", "knockknock", 0]);
 * assertEquals(reply3, "Who's there?");
 * ```
 */
export class RedisClient {
  #conn: Reader & Writer;
  #lines: AsyncIterableIterator<Uint8Array>;
  #queue: Promise<any> = Promise.resolve();

  constructor(conn: Reader & Writer) {
    this.#conn = conn;
    this.#lines = readLines(this.#conn);
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.#queue = this.#queue.then(task);
    return this.#queue;
  }

  /**
   * Sends a command to the Redis server and returns the reply.
   *
   * @example Basic usage
   *
   * ```ts ignore
   * import { RedisClient } from "@iuioiua/r2d2";
   * import { assertEquals } from "@std/assert/equals";
   *
   * using redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * const reply1 = await redisClient.sendCommand(["SET", "hello", "world"]);
   * assertEquals(reply1, "OK");
   *
   * const reply2 = await redisClient.sendCommand(["GET", "hello"]);
   * assertEquals(reply2, "world");
   * ```
   */
  sendCommand(command: Command, raw = false): Promise<Reply> {
    return this.#enqueue(async () => {
      await writeCommand(this.#conn, command);
      return readReply(this.#lines, raw);
    });
  }

  /**
   * Writes a command to the Redis server without listening for a reply.
   *
   * @example Basic usage
   * ```ts ignore
   * import { RedisClient } from "@iuioiua/r2d2";
   * import { assertEquals } from "@std/assert/equals";
   *
   * using redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * await redisClient.writeCommand(["SUBSCRIBE", "mychannel"]);
   * for await (const reply of redisClient.readReplies()) {
   *   assertEquals(reply, ["subscribe", "mychannel", 1]);
   *   break;
   * }
   * await redisClient.writeCommand(["UNSUBSCRIBE", "mychannel"]);
   * ```
   */
  writeCommand(command: Command): Promise<void> {
    return this.#enqueue(() => writeCommand(this.#conn, command));
  }

  /**
   * Used for pub/sub. Listens for replies from the Redis server.
   *
   * See
   * {@link https://redis.io/docs/latest/develop/interact/pubsub/ | Redis Pub/Sub}
   * for more information.
   *
   * @example Basic usage
   * ```ts ignore
   * import { RedisClient } from "@iuioiua/r2d2";
   * import { assertEquals } from "@std/assert/equals";
   *
   * using redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * await redisClient.writeCommand(["SUBSCRIBE", "mychannel"]);
   * for await (const reply of redisClient.readReplies()) {
   *   assertEquals(reply, ["subscribe", "mychannel", 1]);
   *   break;
   * }
   * await redisClient.writeCommand(["UNSUBSCRIBE", "mychannel"]);
   * ```
   */
  async *readReplies(raw = false): AsyncIterableIterator<Reply> {
    while (true) {
      yield await readReply(this.#lines, raw);
    }
  }

  /**
   * Pipelines commands to the Redis server and returns the replies.
   *
   * See
   * {@link https://redis.io/docs/latest/develop/use/pipelining/ | Redis pipelining}
   * for more information.
   *
   * @example Basic usage
   *
   * ```ts ignore
   * import { RedisClient } from "@iuioiua/r2d2";
   * import { assertEquals } from "@std/assert/equals";
   *
   * using redisConn = await Deno.connect({ port: 6379 });
   * const redisClient = new RedisClient(redisConn);
   *
   * const replies = await redisClient.pipelineCommands([
   *   ["INCR", "Y"],
   *   ["INCR", "Y"],
   *   ["INCR", "Y"],
   *   ["INCR", "Y"],
   * ]);
   * assertEquals(replies, [1, 2, 3, 4]);
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
