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
    case BULK_ERROR_PREFIX: {
      const error = await readReply(reader) as string;
      throw new RedisError(error);
    }
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

export class RedisEncoderStream extends TransformStream<RedisCommand, string> {
  constructor() {
    super({
      transform(command, controller) {
        const encodedCommand = command
          .map((arg) => `$${String(arg).length}\r\n${arg}\r\n`)
          .join("");
        controller.enqueue(`*${command.length}\r\n${encodedCommand}`);
      },
    });
  }
}

interface Conn {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

export class RedisClient {
  #reader: ReadableStreamDefaultReader<string>;
  #writable: WritableStream<Uint8Array>;

  constructor(conn: Conn) {
    this.#reader = conn.readable
      .pipeThrough(new TextDecoderStream())
      .getReader();
    this.#writable = conn.writable;
  }

  async read(): Promise<RedisReply> {
    return await readReply(this.#reader);
  }

  async write(command: RedisCommand) {
    await ReadableStream.from(command)
      .pipeThrough(new TextEncoderStream())
      .pipeTo(this.#writable);
  }

  async command(command: RedisCommand): Promise<RedisReply> {
    await this.write(command);
    return await this.read();
  }

  async pipeline(commands: RedisCommand[]): Promise<RedisReply[]> {
    for (const command of commands) {
      await this.write(command);
    }
    return await readReplies(this.#reader, commands.length);
  }
}
