import { concat } from "https://deno.land/std@0.206.0/bytes/concat.ts";

const CRLF = new TextEncoder().encode("\r\n");

/**
 * Gets the index of the first occurrence of the CRLF bytes in a given buffer.
 */
function indexOfCrlf(
  chunk: Uint8Array,
  fromIndex: number,
): number {
  for (let i = fromIndex; i < chunk.length; i++) {
    if (chunk[i] === CRLF[0] && chunk[i + 1] === CRLF[1]) {
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
 * import { RedisLineStream } from "./line_stream.ts";
 *
 * const stream = ReadableStream.from("hello\r\nthere\r\n")
 *   .pipeThrough(new TextEncoderStream())
 *   .pipeThrough(new RedisLineStream())
 *   .pipeThrough(new TextDecoderStream());
 *
 * await Array.fromAsync(stream); // Returns [ "hello", "world" ]
 * ```
 */
export class RedisLineStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor() {
    let carry = new Uint8Array();

    super({
      transform(chunk, controller) {
        const buffer = concat([carry, chunk]);

        let separatorIndex = indexOfCrlf(buffer, 0);
        let startSearchIndex = 0;

        while (separatorIndex !== -1) {
          const line = buffer.subarray(startSearchIndex, separatorIndex);
          controller.enqueue(line);
          startSearchIndex = separatorIndex + CRLF.length;
          separatorIndex = indexOfCrlf(buffer, startSearchIndex);
        }

        carry = buffer.slice(startSearchIndex);
      },
    });
  }
}
