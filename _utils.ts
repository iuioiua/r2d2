import { writeCommand } from "./mod.ts";

/** Default port for Redis. */
export const PORT = 6379;

/** Shutdown the Redis server and close the connection. */
export async function close(redisConn: Deno.Conn): Promise<void> {
  await writeCommand(redisConn, ["SHUTDOWN"]);
  redisConn.close();
}
