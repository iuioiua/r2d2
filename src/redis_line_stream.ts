const CRLF = "\r\n";

/**
 * Divides a stream into chunks delimited by CRLF bytes.
 *
 * @example
 * ```ts
 * import { RedisLineStream } from "./line_stream.ts";
 *
 * const stream = ReadableStream
 *   .from("hello\r\nthere\r\n")
 *   .pipeThrough(new RedisLineStream());
 *
 * await Array.fromAsync(stream); // [ "hello", "world" ]
 * ```
 */
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
