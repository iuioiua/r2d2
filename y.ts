const SEPARATOR = new TextEncoder().encode("\r\n");

function indexOf(
  chunk: Uint8Array,
  fromIndex: number,
): number {
  for (let i = fromIndex; i < chunk.length; i++) {
    if (chunk[i] === SEPARATOR[0] && chunk[i + 1] === SEPARATOR[1]) {
      return i;
    }
  }
  return -1;
}

function indexOf2(chunk: Uint8Array, fromIndex?: number) {
  const crIndex = chunk.indexOf(SEPARATOR[0], fromIndex);
  return chunk[crIndex + 1] === SEPARATOR[1] ? crIndex : -1;
}

Deno.bench("indexOf", () => {
  indexOf(SEPARATOR, 0);
});

Deno.bench("indexOf2", () => {
  indexOf2(SEPARATOR);
});
