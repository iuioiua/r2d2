import { concat } from "https://deno.land/std@0.206.0/bytes/concat.ts";

const SEPARATOR = new TextEncoder().encode("\r\n");

/**
 * Gets the index of the first occurrence of the CRLF bytes in a given buffer.
 *
 * @example
 * ```ts
 *
 * ```
 */
function indexOf(
  chunk: Uint8Array,
  fromIndex: number,
): number {
  for (let i = fromIndex; i < chunk.length; i++) {
    if (chunk[i] === SEPARATOR[0] && chunk[i + 1] === SEPARATOR[1]) {
      return i;
    }
  }
  return -1;
}

/**
 * Divides a stream into chunks delimited by CRLF bytes.
 *
 * @example
 * ```ts
 * import { LineStream } from "./line_stream.ts";
 *
 * const stream = ReadableStream.from("hello\r\nthere\r\n")
 *   .pipeThrough(new TextEncoderStream())
 *   .pipeThrough(new LineStream())
 *   .pipeThrough(new TextDecoderStream());
 *
 * await Array.fromAsync(stream); // Returns [ "hello", "world" ]
 * ```
 */
export class LineStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor() {
    let carryOver = new Uint8Array();

    super({
      transform(chunk, controller) {
        const buffer = concat([carryOver, chunk]);

        let separatorIndex = indexOf(buffer, 0);
        let startSearchIndex = 0;

        while (separatorIndex !== -1) {
          const line = buffer.subarray(startSearchIndex, separatorIndex);
          controller.enqueue(line);
          startSearchIndex = separatorIndex + SEPARATOR.length;
          separatorIndex = indexOf(buffer, startSearchIndex);
        }

        carryOver = buffer.slice(startSearchIndex);
      },
      flush(controller) {
        if (carryOver.length > 0) {
          controller.enqueue(carryOver);
          carryOver = new Uint8Array();
        }
      },
    });
  }
}
