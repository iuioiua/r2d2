// deno-lint-ignore-file no-explicit-any
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
  SET_PREFIX,
  SIMPLE_STRING_PREFIX,
  STREAMED_AGGREGATE_DELIMITER,
  STREAMED_REPLY_FIRST_LINE,
  STREAMED_STRING_DELIMITER,
  VERBATIM_STRING_PREFIX,
} from "./constants.ts";

/** Parsed Redis reply */
export type Reply =
  | string
  | number
  | null
  | boolean
  | BigInt
  | Record<string, any>
  | Reply[];

function removePrefix(line: string): string {
  return line.slice(1);
}

function isSteamedReply(line: string): boolean {
  return line.charAt(1) === STREAMED_REPLY_FIRST_LINE;
}

function toObject(array: any[]): Record<string, any> {
  return Object.fromEntries(chunk(array, 2));
}

export async function readNReplies(
  length: number,
  bufReader: BufReader,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  for (let i = 0; i < length; i++) {
    replies.push(await readReply(bufReader));
  }
  return replies;
}

async function readDelimitedReplies(
  delimiter: string,
  bufReader: BufReader,
): Promise<Reply[]> {
  const replies: Reply[] = [];
  while (true) {
    const reply = await readReply(bufReader);
    if (reply === delimiter) {
      break;
    }
    replies.push(reply);
  }
  return replies;
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
  return readNumber(line) === -1 ? null : await readReply(bufReader) as string;
}

async function readStreamedString(bufReader: BufReader): Promise<string> {
  return (await readDelimitedReplies(STREAMED_STRING_DELIMITER, bufReader))
    /** Remove byte counts */
    .filter((line) => !(line as string).startsWith(";"))
    .join("");
}

async function readArray(
  line: string,
  bufReader: BufReader,
): Promise<null | Reply[]> {
  const length = readNumber(line);
  return length === -1 ? null : await readNReplies(length, bufReader);
}

async function readStreamedArray(bufReader: BufReader) {
  return await readDelimitedReplies(STREAMED_AGGREGATE_DELIMITER, bufReader);
}

async function readMap(
  line: string,
  bufReader: BufReader,
): Promise<Record<string, any>> {
  const length = readNumber(line) * 2;
  const array = await readNReplies(length, bufReader);
  return toObject(array);
}

async function readStreamedMap(bufReader: BufReader) {
  const array = await readDelimitedReplies(
    STREAMED_AGGREGATE_DELIMITER,
    bufReader,
  );
  return toObject(array);
}

function readBoolean(line: string): boolean {
  return removePrefix(line) === "t";
}

/** Reads an integer or double */
function readNumber(line: string): number {
  const number = removePrefix(line);
  switch (number) {
    case "inf":
      return Infinity;
    case "-inf":
      return -Infinity;
    default:
      return Number(number);
  }
}

async function readBlobError(bufReader: BufReader): Promise<never> {
  /** Skip to reading the next line, which is a string */
  return await Promise.reject(await readReply(bufReader) as string);
}

function readBigNumber(line: string): BigInt {
  return BigInt(removePrefix(line));
}

async function readStreamedSet(bufReader: BufReader): Promise<Set<Reply>> {
  return new Set(await readStreamedArray(bufReader));
}

async function readSet(
  line: string,
  bufReader: BufReader,
): Promise<Set<Reply>> {
  return new Set(await readArray(line, bufReader));
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
      return isSteamedReply(line)
        ? await readStreamedString(bufReader)
        : await readString(line, bufReader);
    case ARRAY_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedArray(bufReader)
        : await readArray(line, bufReader);
    case MAP_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedMap(bufReader)
        : await readMap(line, bufReader);
    case BOOLEAN_PREFIX:
      return readBoolean(line);
    case NULL_PREFIX:
      return null;
    case BLOB_ERROR_PREFIX:
      return readBlobError(bufReader);
    case BIG_NUMBER_PREFIX:
      return readBigNumber(line);
    case SET_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedSet(bufReader)
        : await readSet(line, bufReader);
    /** No prefix */
    default:
      return line;
  }
}
