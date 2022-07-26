import { BufReader, writeAll } from "./deps.ts";

/** Redis command, which is an array of arguments. */
export type Command = (string | number)[];
/** Parsed Redis reply */
export type Reply = string | number | null | Reply[];

const CRLF = "\r\n";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function removePrefix(line: string): string {
  return line.slice(1);
}

async function readLine(bufReader: BufReader): Promise<string | null> {
  const result = await bufReader.readLine();
  return decoder.decode(result?.line) ?? null;
}

/**
 * Transforms a command, which is an array of arguments, into an RESP request string.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#send-commands-to-a-redis-server}
 */
function stringifyRequest(command: Command): string {
  let request = "*" + command.length + CRLF;
  for (const arg of command) {
    request += "$" + arg.toString().length + CRLF;
    request += arg + CRLF;
  }
  return request;
}

/** Encodes and sends the request string to the server. */
async function writeRequest(
  conn: Deno.Conn,
  request: string,
): Promise<void> {
  await writeAll(conn, encoder.encode(request));
}

async function readArray(
  tpReader: TextProtoReader,
  length: number,
): Promise<null | Reply[]> {
  if (length === -1) {
    return null;
  }
  const array = [];
  for (let i = 0; i < length; i++) {
    const reply = await readReply(tpReader);
    array.push(reply);
  }
  return array;
}

/**
 * Reads and processes the response line-by-line.
 *
 * See {@link https://redis.io/docs/reference/protocol-spec/#resp-protocol-description}
 */
async function readReply(bufReader: BufReader): Promise<Reply> {
  const line = await readLine(bufReader);
  if (line === null) {
    return await Promise.reject("No response received from Redis server");
  }
  switch (line.charAt(0)) {
    /** Simple string */
    case "+":
      return removePrefix(line);
    /** Error */
    case "-":
      return await Promise.reject(removePrefix(line));
    /** Integer */
    case ":":
      return Number(removePrefix(line));
    /** Bulk string */
    case "$":
      return Number(removePrefix(line)) === -1
        ? null
        : /** Skip to reading the next line, which is a string */
          await readReply(bufReader);
    /** Array */
    case "*":
      return await readArray(tpReader, Number(removePrefix(line)));
    /** No prefix */
    default:
      return line;
  }
}

/**
 * Sends a command to the Redis server and returns the parsed reply.
 *
 * Example:
 * ```ts
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * await sendCommand(redisConn, ["SET", "hello", "world"]); // Returns "OK"
 *
 * await sendCommand(redisConn, ["GET", "hello"]); // Returns "world"
 * ```
 */
export async function sendCommand(
  redisConn: Deno.Conn,
  command: Command,
): Promise<Reply> {
  await writeCommand(redisConn, command);
  return await readReply(new BufReader(redisConn));
}

/**
 * Pipelines commands to the Redis server and returns the parsed replies.
 *
 * Example:
 * ```ts
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * await pipelineCommands(redisConn, [
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 * ]); // Returns [1, 2, 3, 4]
 * ```
 */
export async function pipelineCommands(
  redisConn: Deno.Conn,
  commands: Command[],
): Promise<Reply[]> {
  const request = commands.map(createRequest).join("");
  await writeRequest(redisConn, request);
  const bufReader = new BufReader(redisConn);
  const replies: Reply[] = [];
  for (let i = 0; i < commands.length; i++) {
    replies.push(await readReply(bufReader));
  }
  return replies;
  }
}
