import { type BufReader, chunk } from "../deps.ts";
import {
  ARRAY_PREFIX,
  BOOLEAN_PREFIX,
  BULK_STRING_PREFIX,
  decoder,
  ERROR_PREFIX,
  INTEGER_PREFIX,
  MAP_PREFIX,
  NULL_PREFIX,
  SIMPLE_STRING_PREFIX,
} from "./constants.ts";

/** Parsed Redis reply */
export type Reply = string | number | null | boolean | Reply[];

function removePrefix(line: string): string {
  return line.slice(1);
}

function readSimpleString(line: string): string {
  return removePrefix(line);
}

async function readError(line: string): Promise<never> {
  return await Promise.reject(removePrefix(line).slice(4));
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

export async function readNReplies(
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
  return length === -1 ? null : await readNReplies(length, bufReader);
}

async function readMap(line: string, bufReader: BufReader) {
  const length = readInteger(line) / 2;
  const reply = await readNReplies(length, bufReader);
  return Object.fromEntries(chunk(reply, 2));
}

function readBoolean(line: string): boolean {
  return removePrefix(line) === "t";
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
    case MAP_PREFIX:
      return await readMap(line, bufReader);
    case BOOLEAN_PREFIX:
      return readBoolean(line);
    case NULL_PREFIX:
      return null;
    /** No prefix */
    default:
      return line;
  }
}
