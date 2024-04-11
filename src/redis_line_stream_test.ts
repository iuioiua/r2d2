import { RedisLineStream } from "./redis_line_stream.ts";
import { assertEquals } from "@std/assert";

Deno.test("RedisLineStream", async () => {
  const stream = ReadableStream.from("hello\r\nworld\r\n\r\n")
    .pipeThrough(new RedisLineStream());

  const result = await Array.fromAsync(stream);
  assertEquals(result, ["hello", "world", ""]);
});
