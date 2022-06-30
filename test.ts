import {
  afterAll,
  afterEach,
  beforeAll,
} from "https://deno.land/std@0.145.0/testing/bdd.ts";
import { delay } from "https://deno.land/std@0.145.0/async/mod.ts";

import { sendCommand } from "./mod.ts";

let conn: Deno.Conn;

/** The server listens on port 6379 by default */
beforeAll(async () => {
  Deno.run({
    cmd: ["redis-server"],
    stdin: "null",
    stdout: "null",
  });
  await delay(1_000);
  conn = await Deno.connect({ port: 6379 });
});

afterEach(async () => {
  await sendCommand(conn, ["FLUSHDB"]);
});

afterAll(() => conn.close());
