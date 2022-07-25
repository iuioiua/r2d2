/** For use in tests and benchmarks. */
export const REDIS_PORT = Number(Deno.env.get("REDIS_PORT") ?? 6379);
export const SERVER_PROCESS = Deno.run({
  cmd: [
    "redis-server",
    "--daemonize",
    "yes",
    "--port",
    REDIS_PORT.toString(),
  ],
  stdin: "null",
  stdout: "null",
});
