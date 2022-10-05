import { BufReader, concat, writeAll } from "../deps.ts";
import { type Command, createRequest, writeCommand } from "./request.ts";
import { readRepliesN, readReply, type Reply } from "./reply.ts";

export { type Command, type Reply, writeCommand };

/**
 * Sends a command to the Redis server and returns the parsed reply.
 *
 * Example:
 * ```ts
 * import { sendCommand } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * // Returns "OK"
 * await sendCommand(redisConn, ["SET", "hello", "world"]);
 *
 * // Returns "world"
 * await sendCommand(redisConn, ["GET", "hello"]);
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
 * import { pipelineCommands } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * // Returns [1, 2, 3, 4]
 * await pipelineCommands(redisConn, [
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 *  ["INCR", "X"],
 * ]);
 * ```
 */
export async function pipelineCommands(
  redisConn: Deno.Conn,
  commands: Command[],
): Promise<Reply[]> {
  const request = concat(...commands.map(createRequest));
  await writeAll(redisConn, request);
  return readRepliesN(commands.length, new BufReader(redisConn));
}

/**
 * Used for pub/sub. Listens for replies from the Redis server.
 *
 * Example:
 * ```ts
 * import { writeCommand, listenReplies } from "https://deno.land/x/r2d2@$VERSION/mod.ts";
 *
 * const redisConn = await Deno.connect({ port: 6379 });
 *
 * await writeCommand(redisConn, ["SUBSCRIBE", "mychannel"]);
 *
 * for await (const reply of listenReplies(redisConn)) {
 *   // Prints ["subscribe", "mychannel", 1] first iteration
 *   console.log(reply);
 * }
 * ```
 */
export async function* listenReplies(
  redisConn: Deno.Conn,
): AsyncIterableIterator<Reply> {
  const bufReader = new BufReader(redisConn);
  while (true) {
    yield await readReply(bufReader);
  }
}
