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

export type RedisReply =
  | string
  | number
  | null
  | boolean
  | bigint
  | RedisReply[];

export class RedisError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

function parseLine(line: string): RedisReply | undefined {
  switch (line[0]) {
    case SIMPLE_STRING_PREFIX:
      return line.slice(1);
    case SIMPLE_ERROR_PREFIX:
      throw new RedisError(line.slice(1));
    case INTEGER_PREFIX:
      return Number(line.slice(1));
    case BULK_STRING_PREFIX: {
      const length = Number(line.slice(1));
      return length === -1 ? null : undefined;
    }
    case NULL_PREFIX:
      return null;
    case BOOLEAN_PREFIX:
      return line[1] === "t";
    case DOUBLE_PREFIX: {
      const number = line.slice(1);
      switch (number) {
        case "inf":
          return Infinity;
        case "-inf":
          return -Infinity;
        default:
          return Number(number);
      }
    }
    case BIG_NUMBER_PREFIX:
      return BigInt(line.slice(1));
    case BULK_ERROR_PREFIX:
      throw new RedisError(line);
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
      | undefined = undefined;
    super({
      transform(line, controller) {
        if (previousPrefix === ARRAY_PREFIX) {
          const result = parseLine(line);
          if (result === undefined) {
            return;
          } else {
            array!.push(parseLine(line)!);
          }
          if (array!.length === count!) {
            controller.enqueue(array!);
            previousPrefix = undefined;
            array = undefined;
            count = undefined;
          }
          return;
        }
        switch (line[0]) {
          case SIMPLE_STRING_PREFIX: {
            controller.enqueue(line.slice(1));
            break;
          }
          case SIMPLE_ERROR_PREFIX: {
            controller.error(new RedisError(line.slice(1)));
            break;
          }
          case INTEGER_PREFIX: {
            controller.enqueue(Number(line.slice(1)));
            break;
          }
          case VERBATIM_STRING_PREFIX:
          case BULK_STRING_PREFIX: {
            const length = line.slice(1);
            if (length === "-1") {
              controller.enqueue(null);
            }
            break;
          }
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
          case NULL_PREFIX: {
            controller.enqueue(null);
            break;
          }
          case BOOLEAN_PREFIX: {
            controller.enqueue(line[1] === "t");
            break;
          }
          case DOUBLE_PREFIX: {
            const number = line.slice(1);
            switch (number) {
              case "inf":
                controller.enqueue(Infinity);
                break;
              case "-inf":
                controller.enqueue(-Infinity);
                break;
              default:
                controller.enqueue(Number(number));
                break;
            }
            break;
          }
          case BIG_NUMBER_PREFIX: {
            controller.enqueue(BigInt(line.slice(1)));
            break;
          }
          case BULK_ERROR_PREFIX: {
            previousPrefix = BULK_ERROR_PREFIX;
            break;
          }
          default: {
            if (previousPrefix === BULK_ERROR_PREFIX) {
              controller.error(new RedisError(line));
              previousPrefix = undefined;
            }
            controller.enqueue(line);
            break;
          }
        }
      },
    });
  }
}
