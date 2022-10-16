import { assertEquals, StringWriter } from "../deps.ts";
import { writeCommand } from "./request.ts";

Deno.test("write command", async () => {
  const writer = new StringWriter();
  await writeCommand(writer, ["LLEN", "mylist", 42]);
  assertEquals(
    writer.toString(),
    "*3\r\n$4\r\nLLEN\r\n$6\r\nmylist\r\n$2\r\n42\r\n",
  );
});
