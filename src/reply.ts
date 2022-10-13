import { type BufReader, chunk } from "../deps.ts";
import {
  ARRAY_PREFIX,
  BIG_NUMBER_PREFIX,
  BLOB_ERROR_PREFIX,
  BOOLEAN_PREFIX,
  BULK_STRING_PREFIX,
  decoder,
  DOUBLE_PREFIX,
  ERROR_PREFIX,
  INTEGER_PREFIX,
  MAP_PREFIX,
  NULL_PREFIX,
  SIMPLE_STRING_PREFIX,
  VERBATIM_STRING_PREFIX,
} from "./constants.ts";

/** Parsed Redis reply */
export type Reply =
  | string
  | number
  | null
  | boolean
  | BigInt
  // deno-lint-ignore no-explicit-any
  | Record<string, any>
  | Reply[];

function removePrefix(line: string): string {
  return line.slice(1);
}

function readSimpleString(line: string): string {
  return removePrefix(line);
}

async function readError(line: string): Promise<never> {
  return await Promise.reject(removePrefix(line).slice(4));
}

/** Reads a bulk string or verbatim string */
async function readString(
  line: string,
  bufReader: BufReader,
): Promise<null | string> {
  return readNumber(line) === -1
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
  const length = readNumber(line);
  return length === -1 ? null : await readNReplies(length, bufReader);
}

async function readMap(line: string, bufReader: BufReader) {
  const length = readNumber(line) * 2;
  const reply = await readNReplies(length, bufReader);
  return Object.fromEntries(chunk(reply, 2));
}

function readBoolean(line: string): boolean {
  return removePrefix(line) === "t";
}

/** Reads an integer or double */
function readNumber(line: string): number {
  const inter = removePrefix(line);
  switch (inter) {
    case "inf":
      return Infinity;
    case "-inf":
      return -Infinity;
    default:
      return Number(inter);
  }
}

async function readBlobError(bufReader: BufReader): Promise<never> {
  /** Skip to reading the next line, which is a string */
  return await Promise.reject(await readReply(bufReader) as string);
}

function readBigNumber(line: string): BigInt {
  return BigInt(removePrefix(line));
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
    case DOUBLE_PREFIX:
      return readNumber(line);
    case BULK_STRING_PREFIX:
    case VERBATIM_STRING_PREFIX:
      return await readString(line, bufReader);
    case ARRAY_PREFIX:
      return await readArray(line, bufReader);
    case MAP_PREFIX:
      return await readMap(line, bufReader);
    case BOOLEAN_PREFIX:
      return readBoolean(line);
    case NULL_PREFIX:
      return null;
    case BLOB_ERROR_PREFIX:
      return readBlobError(bufReader);
    case BIG_NUMBER_PREFIX:
      return readBigNumber(line);
    /** No prefix */
    default:
      return line;
  }
}
