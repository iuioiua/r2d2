import { LineStream } from "./line_stream.ts";
import { assertEquals } from "https://deno.land/std@0.210.0/assert/assert_equals.ts";

Deno.test("LineStream() should correctly divide a stream into chunks", async () => {
  const stream = ReadableStream.from("hello\r\nthere\r\n")
    .pipeThrough(new TextEncoderStream())
    .pipeThrough(new LineStream())
    .pipeThrough(new TextDecoderStream());

  const result = await Array.fromAsync(stream);
  assertEquals(result, ["hello", "there"]);
});

Deno.test("LineStream() should handle carry over correctly", async () => {
  const stream = ReadableStream.from("hello\r\nthere")
    .pipeThrough(new TextEncoderStream())
    .pipeThrough(new LineStream())
    .pipeThrough(new TextDecoderStream());

  const result = await Array.fromAsync(stream);
  assertEquals(result, ["hello", "there"]);
});
