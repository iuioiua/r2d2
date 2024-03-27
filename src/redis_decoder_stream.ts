import { chunk } from "@std/collections/chunk";

const SIMPLE_STRING_PREFIX = "+" as const;
const SIMPLE_ERROR_PREFIX = "-" as const;
const INTEGER_PREFIX = ":" as const;
const BULK_STRING_PREFIX = "$" as const;
const ARRAY_PREFIX = "*" as const;
const NULL_PREFIX = "_" as const;
const BOOLEAN_PREFIX = "#" as const;
const DOUBLE_PREFIX = "," as const;
const BIG_NUMBER_PREFIX = "(" as const;
const BULK_ERROR_PREFIX = "!" as const;
const VERBATIM_STRING_PREFIX = "=" as const;
const MAP_PREFIX = "%" as const;
const SET_PREFIX = "~" as const;
const PUSH_PREFIX = ">" as const;

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
  | RedisReplyPart[];

export class RedisError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/**
 * @returns `undefined` if the value of the current line is to be ignored.
 */
function parseLine(line: string): RedisReply | undefined {
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
      return Number(value) === -1 ? null : undefined;
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
      return undefined;

    default:
      return line;
  }
}

export class RedisDecoderStream extends TransformStream<string, RedisReply> {
  constructor() {
    let count: number | undefined = undefined;
    let array: RedisReply[] | undefined = undefined;
    let previousPrefix:
      | typeof BULK_ERROR_PREFIX
      | typeof ARRAY_PREFIX
      | typeof MAP_PREFIX
      | typeof SET_PREFIX
      | typeof PUSH_PREFIX
      | undefined = undefined;
    super({
      transform(line, controller) {
        switch (previousPrefix) {
          case PUSH_PREFIX:
          case ARRAY_PREFIX: {
            const result = parseLine(line);
            if (result === undefined) return;
            array!.push(result);
            if (array!.length === count!) {
              controller.enqueue(array! as RedisReply);
              previousPrefix = undefined;
              array = undefined;
              count = undefined;
            }
            break;
          }
          case BULK_ERROR_PREFIX: {
            controller.error(new RedisError(line));
            previousPrefix = undefined;
            break;
          }
          case MAP_PREFIX: {
            const result = parseLine(line);
            if (result === undefined) return;
            array!.push(result);
            if (array!.length === count!) {
              controller.enqueue(Object.fromEntries(chunk(array!, 2)));
              previousPrefix = undefined;
              array = undefined;
              count = undefined;
            }
            break;
          }
          case SET_PREFIX: {
            const result = parseLine(line);
            if (result === undefined) return;
            array!.push(result);
            if (array!.length === count!) {
              controller.enqueue(new Set(array!) as RedisReply);
              previousPrefix = undefined;
              array = undefined;
              count = undefined;
            }
            break;
          }
        }
        switch (line[0]) {
          case PUSH_PREFIX:
          case ARRAY_PREFIX: {
            count = Number(line.slice(1));
            if (count === 0) {
              controller.enqueue([]);
              break;
            }
            previousPrefix = ARRAY_PREFIX;
            array = [];
            break;
          }
          case BULK_ERROR_PREFIX: {
            previousPrefix = BULK_ERROR_PREFIX;
            break;
          }
          case MAP_PREFIX: {
            count = Number(line.slice(1)) * 2;
            previousPrefix = MAP_PREFIX;
            array = [];
            break;
          }
          case SET_PREFIX: {
            count = Number(line.slice(1));
            previousPrefix = SET_PREFIX;
            array = [];
            break;
          }
          default: {
            const result = parseLine(line);
            if (result !== undefined) {
              controller.enqueue(result);
            }
          }
        }
      },
    });
  }
}
