const decoder = new TextDecoder();

const ARRAY_PREFIX = 42 as const; // "*"
const BIG_NUMBER_PREFIX = 40 as const; // "("
const BOOLEAN_PREFIX = 35 as const; // "#"
const DOUBLE_PREFIX = 44 as const; // ","
const INTEGER_PREFIX = 58 as const; // ":"
const SIMPLE_STRING_PREFIX = 43 as const; // "+"
const NULL_PREFIX = 95 as const; // "_"
const T_CHAR = 116 as const; // "t"

function removePrefix(line: Uint8Array): string {
  return decoder.decode(line.slice(1));
}

function toBoolean(line: Uint8Array): boolean {
  return line[1] === T_CHAR;
}

function toNumber(line: Uint8Array): number {
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

export class RedisDeserializationStream extends TransformStream<Uint8Array> {
  constructor() {
    let linesRemaining: number | undefined = undefined;

    super({
      transform(line, controller) {
        switch (line[0]) {
          case ARRAY_PREFIX:
            const length = Number(removePrefix(line));
            if (length === -1) {
            }
            break;
          case BIG_NUMBER_PREFIX:
            controller.enqueue(BigInt(removePrefix(line)));
            controller.terminate();
            return;
          case BOOLEAN_PREFIX: {
            controller.enqueue(toBoolean(line));
            controller.terminate();
            return;
          }
          case INTEGER_PREFIX:
          case DOUBLE_PREFIX: {
            controller.enqueue(toNumber(line));
            controller.terminate();
            return;
          }
          case NULL_PREFIX: {
            controller.enqueue(null);
            controller.terminate();
            break;
          }
          case SIMPLE_STRING_PREFIX: {
            controller.enqueue(removePrefix);
            controller.terminate();
            break;
          }
          default:
            controller.enqueue(line);
            if (linesRemaining !== undefined) {
              linesRemaining--;
              if (linesRemaining === 0) {
                controller.terminate();
              }
            }
        }
      },
    });
  }
}
