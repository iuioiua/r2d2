import { type BufReader } from "../deps.ts";
import {
  ARRAY_PREFIX,
  BULK_STRING_PREFIX,
  decoder,
  ERROR_PREFIX,
  INTEGER_PREFIX,
  SIMPLE_STRING_PREFIX,
} from "./common.ts";

/** Parsed Redis reply */
export type Reply = string | number | null | Reply[];

function removePrefix(line: string): string {
  return line.slice(1);
}

function readSimpleString(line: string): string {
  return removePrefix(line);
}

async function readError(line: string): Promise<never> {
  return await Promise.reject(removePrefix(line));
}

function readInteger(line: string): number {
  return Number(removePrefix(line));
}

async function readBulkString(
  line: string,
  bufReader: BufReader,
): Promise<null | string> {
  return readInteger(line) === -1
    ? null
    /** Skip to reading the next line, which is a string */
    : await readReply(bufReader) as string;
}

export async function readRepliesN(
  length: number,
  bufReader: BufReader,
): Promise<Reply[]> {
  const array: Reply[] = [];
  for (let i = 0; i < length; i++) {
    array.push(await readReply(bufReader));
  }
  return array;
}

async function readArray(
  line: string,
  bufReader: BufReader,
): Promise<null | Reply[]> {
  const length = readInteger(line);
  return length === -1 ? null : await readRepliesN(length, bufReader);
}

/**
 * Reads and processes the response line-by-line.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#resp-protocol-description}
 */
export async function readReply(bufReader: BufReader): Promise<Reply> {
  const result = await bufReader.readLine();
  if (!result) {
    return await Promise.reject("No reply received from Redis server");
  }
  const line = decoder.decode(result.line);
  switch (line.charAt(0)) {
    case SIMPLE_STRING_PREFIX:
      return readSimpleString(line);
    case ERROR_PREFIX:
      return readError(line);
    case INTEGER_PREFIX:
      return readInteger(line);
    case BULK_STRING_PREFIX:
      return await readBulkString(line, bufReader);
    case ARRAY_PREFIX:
      return await readArray(line, bufReader);
    /** No prefix */
    default:
      return line;
  }
}
