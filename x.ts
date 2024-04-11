class LineBufferTransformStream extends TransformStream<string, string> {
  constructor(maxLineBreaks: number) {
    let partial = "";
    let lineBreakCount = 0;

    super({
      transform(chars, controller) {
        buffer += chunk;
        let position;
        // Continuously search for "\r\n" in the buffer
        while ((position = buffer.indexOf("\r\n")) !== -1) {
          // Increment the line break count and check the condition after increment
          lineBreakCount++;
          // If the line break count reaches the specified maxLineBreaks, enqueue and reset
          if (lineBreakCount === maxLineBreaks) {
            // Enqueue up to and including the current "\r\n"
            controller.enqueue(buffer.substring(0, position + 2));
            // Update the buffer to remove the enqueued part
            buffer = buffer.substring(position + 2);
            // Reset lineBreakCount for the next set of line breaks
            lineBreakCount = 0;
          } else {
            // If not reaching maxLineBreaks yet, just skip this "\r\n"
            // Update buffer start to the character after the current "\r\n"
            buffer = buffer.substring(position + 2);
          }
        }
      },
      flush(controller) {
        // When the stream ends, if there's any remaining text in the buffer, it's enqueued
        if (buffer) {
          controller.enqueue(buffer);
          buffer = ""; // Clear the buffer
        }
      },
    });
  }
}

const stream = ReadableStream.from(
  "First line\r\nSecond line\r\nThird line\r\nFourth line\r\n",
).pipeThrough(new LineBufferTransformStream(3));

console.log(await Array.fromAsync(stream));

async function readReply();
