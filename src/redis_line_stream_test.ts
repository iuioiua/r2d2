import { RedisLineStream } from "./redis_line_stream.ts";
import { assertEquals } from "https://deno.land/std@0.210.0/assert/assert_equals.ts";

Deno.test("LineStream", async () => {
  const stream = ReadableStream.from("hello\r\nthere\r\n")
    .pipeThrough(new TextEncoderStream())
    .pipeThrough(new RedisLineStream())
    .pipeThrough(new TextDecoderStream());

  const result = await Array.fromAsync(stream);
  assertEquals(result, ["hello", "there"]);
});
