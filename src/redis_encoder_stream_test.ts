import {
  type RedisCommand,
  RedisEncoderStream,
} from "./redis_encoder_stream.ts";
import { assertEquals } from "@std/assert";

Deno.test("RedisEncoderStream", async () => {
  const stream = ReadableStream.from<RedisCommand>([
    ["SET", "key", 42],
    ["GET", "key"],
    ["INCR", "counter"],
  ]).pipeThrough(new RedisEncoderStream());
  const result = await Array.fromAsync(stream);
  const expected = [
    "*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$2\r\n42\r\n",
    "*2\r\n$3\r\nGET\r\n$3\r\nkey\r\n",
    "*2\r\n$4\r\nINCR\r\n$7\r\ncounter\r\n",
  ];
  assertEquals(result, expected);
});
