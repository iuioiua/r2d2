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

async function readReply(
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
    case BULK_ERROR_PREFIX:
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
      return value;
  }
}
