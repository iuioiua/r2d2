import { BytesList } from "https://deno.land/std@0.164.0/bytes/bytes_list.ts";

/** Copied from `std/streams`. */
export async function writeAll(writer: Deno.Writer, bytes: Uint8Array) {
  let bytesWritten = 0;
  while (bytesWritten < bytes.byteLength) {
    bytesWritten += await writer.write(bytes.subarray(bytesWritten));
  }
}

/** Copied from `std/io`. */
export async function* readDelim(
  reader: Deno.Reader,
  delim: Uint8Array,
): AsyncIterableIterator<Uint8Array> {
  // Avoid unicode problems
  const delimLen = delim.length;
  const chunks = new BytesList();
  const bufSize = 1024;

  // Modified KMP
  let inspectIndex = 0;
  let matchIndex = 0;
  while (true) {
    const inspectArr = new Uint8Array(bufSize);
    const result = await reader.read(inspectArr);
    if (result === null) {
      // Yield last chunk.
      yield chunks.concat();
      return;
    }
    chunks.add(inspectArr, 0, result);
    let localIndex = 0;
    while (inspectIndex < chunks.size()) {
      if (inspectArr[localIndex] === delim[matchIndex]) {
        inspectIndex++;
        localIndex++;
        matchIndex++;
        if (matchIndex === delimLen) {
          // Full match
          const readyBytes = chunks.slice(0, inspectIndex - delimLen);
          yield readyBytes;
          // Reset match, different from KMP.
          chunks.shift(inspectIndex);
          inspectIndex = 0;
          matchIndex = 0;
        }
      } else {
        inspectIndex++;
        localIndex++;
      }
    }
  }
}

/** Read delimited strings from a Reader. */
export async function* readStringDelim(
  reader: Deno.Reader,
  delim: string,
): AsyncIterableIterator<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  for await (const chunk of readDelim(reader, encoder.encode(delim))) {
    yield decoder.decode(chunk);
  }
}
