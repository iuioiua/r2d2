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
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class RedisDecoderStream extends TransformStream<string, RedisReply> {
  constructor() {
    let count: number | undefined = undefined;
    let array: RedisReply[] = [];
    let isError = false;
    super({
      transform(line, controller) {
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
            isError = true;
            break;
          }
          default: {
            if (isError) {
              controller.error(new RedisError(line));
              isError = false;
              break;
            }
            if (count === undefined) {
              controller.enqueue(line);
            } else {
              console.log(count);
              array.push(line);
              if (array.length === count) {
                console.log(array);
                controller.enqueue(array);
                array = [];
                count = undefined;
              }
            }
            break;
          }
        }
      },
    });
  }
}
