// Copyright 2018-2024 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.

import type { Reader } from "@std/io/types";

const CRLF = new TextEncoder().encode("\r\n");
const BUFFER_LENGTH = 1_024;

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const output = new Uint8Array(a.length + b.length);
  output.set(a, 0);
  output.set(b, a.length);
  return output;
}

export async function* readLines(
  reader: Reader,
): AsyncIterableIterator<Uint8Array> {
  let chunks = new Uint8Array();
  while (true) {
    const buffer = new Uint8Array(BUFFER_LENGTH);
    const result = await reader.read(buffer);
    if (result === null) {
      yield chunks;
      return;
    }
    chunks = concat(chunks, buffer.slice(0, result));
    const crlfIndex = chunks.indexOf(CRLF[0]);
    if (crlfIndex !== -1 && chunks[crlfIndex + 1] === CRLF[1]) {
      const line = chunks.slice(0, crlfIndex);
      yield line;
      chunks = chunks.slice(crlfIndex + 2);
    }
  }
}
