// deno-lint-ignore-file no-explicit-any
import { type BufReader, chunk } from "../deps.ts";
import {
  ARRAY_PREFIX,
  ATTRIBUTE_PREFIX,
  BIG_NUMBER_PREFIX,
  BLOB_ERROR_PREFIX,
  BOOLEAN_PREFIX,
  BULK_STRING_PREFIX,
  DOUBLE_PREFIX,
  ERROR_PREFIX,
  INTEGER_PREFIX,
  MAP_PREFIX,
  NULL_PREFIX,
  SET_PREFIX,
  SIMPLE_STRING_PREFIX,
  STREAMED_AGGREGATE_END_DELIMITER,
  STREAMED_REPLY_START_DELIMITER,
  STREAMED_STRING_END_DELIMITER,
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

/** Utilities */

const decoder = new TextDecoder();

function removePrefix(line: string): string {
  return line.slice(1);
}

function isSteamedReply(line: string): boolean {
  return line.charAt(1) === STREAMED_REPLY_START_DELIMITER;
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

async function readStreamedReply(
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

async function readArray(
  line: string,
  bufReader: BufReader,
): Promise<null | Reply[]> {
  const length = readNumber(line);
  return length === -1 ? null : await readNReplies(length, bufReader);
}

/**
 * Read but don't return actualy attribute data.
 *
 * @todo include attribute data somehow
 */
async function readAttribute(
  line: string,
  bufReader: BufReader,
): Promise<null | Reply> {
  await readMap(line, bufReader);
  return await readReply(bufReader);
}

function readBigNumber(line: string): BigInt {
  return BigInt(removePrefix(line));
}

async function readBlobError(bufReader: BufReader): Promise<never> {
  /** Skip to reading the next line, which is a string */
  return await Promise.reject(await readReply(bufReader) as string);
}

function readBoolean(line: string): boolean {
  return removePrefix(line) === "t";
}

/** Also reads verbatim string */
async function readBulkString(
  line: string,
  bufReader: BufReader,
): Promise<null | string> {
  return removePrefix(line) === "-1"
    ? null
    : await readReply(bufReader) as string;
}

async function readError(line: string): Promise<never> {
  return await Promise.reject(removePrefix(line));
}

async function readMap(
  line: string,
  bufReader: BufReader,
): Promise<Record<string, any>> {
  const length = readNumber(line) * 2;
  const array = await readNReplies(length, bufReader);
  return toObject(array);
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

async function readSet(
  line: string,
  bufReader: BufReader,
): Promise<Set<Reply>> {
  return new Set(await readArray(line, bufReader));
}

function readSimpleString(line: string): string {
  return removePrefix(line);
}

async function readStreamedArray(bufReader: BufReader) {
  return await readStreamedReply(STREAMED_AGGREGATE_END_DELIMITER, bufReader);
}

async function readStreamedMap(bufReader: BufReader) {
  const array = await readStreamedReply(
    STREAMED_AGGREGATE_END_DELIMITER,
    bufReader,
  );
  return toObject(array);
}

async function readStreamedSet(bufReader: BufReader): Promise<Set<Reply>> {
  return new Set(await readStreamedArray(bufReader));
}

async function readStreamedString(bufReader: BufReader): Promise<string> {
  return (await readStreamedReply(STREAMED_STRING_END_DELIMITER, bufReader))
    /** Remove byte counts */
    .filter((line) => !(line as string).startsWith(";"))
    .join("");
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
    case ARRAY_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedArray(bufReader)
        : await readArray(line, bufReader);
    case ATTRIBUTE_PREFIX:
      return await readAttribute(line, bufReader);
    case BIG_NUMBER_PREFIX:
      return readBigNumber(line);
    case BLOB_ERROR_PREFIX:
      return readBlobError(bufReader);
    case BOOLEAN_PREFIX:
      return readBoolean(line);
    case BULK_STRING_PREFIX:
    case VERBATIM_STRING_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedString(bufReader)
        : await readBulkString(line, bufReader);
    case DOUBLE_PREFIX:
    case INTEGER_PREFIX:
      return readNumber(line);
    case ERROR_PREFIX:
      return readError(line);
    case MAP_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedMap(bufReader)
        : await readMap(line, bufReader);
    case NULL_PREFIX:
      return null;
    case SET_PREFIX:
      return isSteamedReply(line)
        ? await readStreamedSet(bufReader)
        : await readSet(line, bufReader);
    case SIMPLE_STRING_PREFIX:
      return readSimpleString(line);
    /** No prefix */
    default:
      return line;
  }
}
