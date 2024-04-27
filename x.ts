import { chunk } from "@std/collections/chunk";

type RedisReplyPart =
  | string
  | number
  | null
  | boolean
  | bigint;
export type RedisReply =
  | RedisReplyPart
  | Record<string, RedisReplyPart>
  | Set<RedisReplyPart>
  | RedisReplyPart[]
  | RedisReply[]
  | Set<RedisReply>;

const CRLF = "\r\n";
const SIMPLE_STRING_PREFIX = "+";
const SIMPLE_ERROR_PREFIX = "-";
const INTEGER_PREFIX = ":";
const BULK_STRING_PREFIX = "$";
const ARRAY_PREFIX = "*";
const NULL_PREFIX = "_";
const BOOLEAN_PREFIX = "#";
const DOUBLE_PREFIX = ",";
const BIG_NUMBER_PREFIX = "(";
const BULK_ERROR_PREFIX = "!";
const VERBATIM_STRING_PREFIX = "=";
const MAP_PREFIX = "%";
const SET_PREFIX = "~";
const PUSH_PREFIX = ">";

export class RedisLineStream extends TransformStream<string, string> {
  constructor() {
    let partialLine = "";
    super({
      transform(chars, controller) {
        const lines = (partialLine + chars).split(CRLF);
        partialLine = lines.pop() || "";
        lines.forEach((line) => controller.enqueue(line));
      },
    });
  }
}

/**
 * An error that occurs in a Redis operation.
 *
 * @param message The error message.
 * @param options Additional options.
 */
export class RedisError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

async function readReplies(
  reader: ReadableStreamDefaultReader<string>,
  length: number,
): Promise<RedisReply[]> {
  const replies: RedisReply[] = [];
  for (let i = 0; i < length; i++) {
    replies.push(await readReply(reader));
  }
  return replies;
}

export async function readReply(
  reader: ReadableStreamDefaultReader<string>,
): Promise<RedisReply> {
  const { value: line } = await reader.read();
  if (line === undefined) throw new RedisError("No reply received");
  const prefix = line[0];
  const value = line.slice(1);
  switch (prefix) {
    case SIMPLE_STRING_PREFIX:
      return value;
    case SIMPLE_ERROR_PREFIX:
      throw new RedisError(value);
    case INTEGER_PREFIX:
      return Number(value);
    case BULK_STRING_PREFIX:
      return Number(value) === -1 ? null : await readReply(reader);
    case PUSH_PREFIX:
    case ARRAY_PREFIX: {
      const length = Number(value);
      return length === -1 ? null : await readReplies(reader, length);
    }
    case NULL_PREFIX:
      return null;
    case BOOLEAN_PREFIX:
      return value === "t";
    case DOUBLE_PREFIX:
      switch (value) {
        case "inf":
          return Infinity;
        case "-inf":
          return -Infinity;
        default:
          return Number(value);
      }
    case BIG_NUMBER_PREFIX:
      return BigInt(value);
    case BULK_ERROR_PREFIX: {
      const error = await readReply(reader) as string;
      throw new RedisError(error);
    }
    case VERBATIM_STRING_PREFIX:
      return await readReply(reader);
    case MAP_PREFIX: {
      const length = Number(value) * 2;
      const array = await readReplies(reader, length);
      return Object.fromEntries(chunk(array, 2));
    }
    case SET_PREFIX: {
      const length = Number(value);
      return new Set(await readReplies(reader, length));
    }
    // No prefix
    default:
      return line;
  }
}

export type RedisCommand = (string | number)[];

class RedisEncoderStream extends TransformStream<RedisCommand, string> {
  constructor() {
    super({
      transform(command, controller) {
        const encodedCommand = command
          .map((arg) => {
            arg = arg.toString();
            return BULK_STRING_PREFIX + arg.length + CRLF + arg + CRLF;
          })
          .join("");
        controller.enqueue(
          ARRAY_PREFIX + command.length + CRLF + encodedCommand,
        );
      },
    });
  }
}

async function sendCommand(
  writable: WritableStream<Uint8Array>,
  reader: ReadableStreamDefaultReader<string>,
  command: RedisCommand,
) {
  await writeCommand(writable, command);
  return await readReply(reader);
}

async function pipeline(
  writable: WritableStream<Uint8Array>,
  reader: ReadableStreamDefaultReader<string>,
  commands: RedisCommand[],
): Promise<RedisReply[]> {
  for (const command of commands) {
    await writeCommand(writable, command);
  }
  return await readReplies(reader, commands.length);
}

interface Conn {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

// https://github.com/denoland/deno/issues/13142#issuecomment-1169072506
class TextDecoderStream extends TransformStream<Uint8Array, string> {
  constructor() {
    const decoder = new TextDecoder();
    super({
      transform(chunk, controller) {
        controller.enqueue(decoder.decode(chunk));
      },
      flush(controller: TransformStreamDefaultController) {
        controller.enqueue(decoder.decode());
      },
    });
  }
}

async function writeCommand(
  writable: WritableStream<Uint8Array>,
  command: RedisCommand,
) {
  await ReadableStream.from([command])
    .pipeThrough(new RedisEncoderStream())
    .pipeThrough(new TextEncoderStream())
    .pipeTo(writable, { preventClose: true });
}

export class RedisClient {
  #reader: ReadableStreamDefaultReader<string>;
  #writable: WritableStream<Uint8Array>;
  // deno-lint-ignore no-explicit-any
  #queue: Promise<any>;

  constructor(conn: Conn) {
    this.#reader = conn.readable
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new RedisLineStream())
      .getReader();
    this.#writable = conn.writable;
    this.#queue = Promise.resolve();
  }

  async #enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.#queue = this.#queue.then(task);
    return await this.#queue;
  }

  async readReply(): Promise<RedisReply> {
    return await this.#enqueue(async () => await readReply(this.#reader));
  }

  async writeCommand(command: RedisCommand) {
    await this.#enqueue(async () =>
      await writeCommand(this.#writable, command)
    );
  }

  async sendCommand(command: RedisCommand): Promise<RedisReply> {
    return await this.#enqueue(async () =>
      await sendCommand(this.#writable, this.#reader, command)
    );
  }

  async pipeline(commands: RedisCommand[]): Promise<RedisReply[]> {
    return await this.#enqueue(async () =>
      await pipeline(this.#writable, this.#reader, commands)
    );
  }
}
