import { BufReader, TextProtoReader, writeAll } from "./deps.ts";

export type Command = (string | number)[];
export type Reply = string | number | null | Reply[];

const CRLF = "\r\n";
const encoder = new TextEncoder();

function removePrefix(line: string): string {
  return line.slice(1);
}

/**
 * Transforms a command, which is an array of arguments, into a RESP request string.
 * @see https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server
 * @param command
 * @returns RESP request string
 */
function stringifyRequest(command: Command): string {
  let request = "*" + command.length + CRLF;
  for (const arg of command) {
    request += "$" + arg.toString().length + CRLF;
    request += arg + CRLF;
  }
  return request;
}

/**
 * Encodes and sends the request string to the server.
 * @param conn Redis connection
 * @param request RESP request string
 */
async function writeRequest(
  conn: Deno.Conn,
  request: string,
): Promise<void> {
  await writeAll(conn, encoder.encode(request));
}

async function readNonNullArray(
  tpReader: TextProtoReader,
  length: number,
): Promise<Reply[]> {
  const array = [];
  for (let i = 0; i < length; i++) {
    const reply: Reply = await readLineOrArray(tpReader);
    array.push(reply);
  }
  return array;
}

async function readLineOrArray(tpReader: TextProtoReader): Promise<Reply> {
  const line = await tpReader.readLine();
  switch (line!.charAt(0)) {
    /** Simple string */
    case "+":
      return removePrefix(line!);
    /** Error */
    case "-":
      return Promise.reject(removePrefix(line!));
    /** Integer */
    case ":":
      return Number(removePrefix(line!));
    /** Bulk string */
    case "$":
      return Number(removePrefix(line!)) === -1
        ? null
        : /** Skip to reading the next line, which is a string */
          await readLineOrArray(tpReader);
    /** Array */
    case "*": {
      const length = Number(removePrefix(line!));
      return length === -1 ? null : await readNonNullArray(tpReader, length);
    }
    /** No prefix */
    default:
      return line;
  }
}

/**
 * Turns the Redis connection into a `TextProtoreader` which is read, line-by-line.
 * @param conn Redis connection
 * @returns RESP reply
 */
async function readReply(conn: Deno.Conn): Promise<Reply> {
  const bufReader = new BufReader(conn);
  const tpReader = new TextProtoReader(bufReader);
  return await readLineOrArray(tpReader);
}

export async function sendCommand(
  conn: Deno.Conn,
  command: Command,
): Promise<Reply> {
  await writeRequest(conn, stringifyRequest(command));
  return await readReply(conn);
}
